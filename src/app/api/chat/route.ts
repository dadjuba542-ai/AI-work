import { auth } from "@/auth";
import { db } from "@/db";
import { agents, conversations, messages, settings, apiProviders, skills, agentSkills } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { callLLM, LLMMessage } from "@/lib/llm";
import { getToolHandler, getToolList, setMiniMaxConfig } from "@/lib/tools";
import { parseOfficeFile } from "@/lib/parse-office";
import type { ToolDef } from "@/lib/llm";
import { join } from "path";
import { readdirSync } from "fs";
import { buildSkillPromptBundle } from "@/lib/skill-runtime";
import { buildRagContext, logRagAnswer, logRagQuery, searchRagChunks, type RagMode } from "@/lib/rag";

interface ToolCallEvent {
  id: string;
  name: string;
  input: string;
  output: string;
  ok: boolean;
  durationMs: number;
  requestId: string;
  errorType?: ToolErrorType;
  retryable?: boolean;
  attempt?: number;
}

type StoredToolExecution = {
  id: string;
  name: string;
  input: string;
};

type UploadedFile = {
  kind: "image" | "text" | "office";
  name: string;
  data?: string;
  type?: string;
};

type ChatRequestBody = {
  agentId?: string;
  conversationId?: string;
  message?: string;
  activeSkills?: string[];
  files?: UploadedFile[];
  model?: string;
  ragMode?: RagMode;
  ragProductId?: string;
  webSearchEnabled?: boolean;
};

type ToolErrorType =
  | "TIMEOUT"
  | "PARAM_INVALID"
  | "PERMISSION_DENIED"
  | "UPSTREAM_ERROR"
  | "TOOL_UNAVAILABLE"
  | "CIRCUIT_OPEN"
  | "UNKNOWN";

type CircuitState = {
  consecutiveFailures: number;
  openUntil: number;
};

const TOOL_EXEC_TIMEOUT_MS = 35000;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 60000;
const toolCircuit = new Map<string, CircuitState>();
const IDEMPOTENT_TOOLS = new Set(["read_file", "web_fetch", "web_search", "discover_skill_files", "load_skill"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyToolError(message: string, toolName: string): ToolErrorType {
  const m = message.toLowerCase();
  if (m.includes("circuit is open")) return "CIRCUIT_OPEN";
  if (m.includes("timed out") || m.includes("timeout") || m.includes("abort")) return "TIMEOUT";
  if (m.includes("invalid") || m.includes("unexpected token") || m.includes("required")) return "PARAM_INVALID";
  if (m.includes("无权限") || m.includes("permission") || m.includes("restricted to admin")) return "PERMISSION_DENIED";
  if (m.includes("unknown tool")) return "TOOL_UNAVAILABLE";
  if (m.includes("failed (") || m.includes("api ") || m.includes("http ")) return "UPSTREAM_ERROR";
  if (toolName === "web_fetch" || toolName === "web_search") return "UPSTREAM_ERROR";
  return "UNKNOWN";
}

function isRetryableError(type: ToolErrorType): boolean {
  return type === "TIMEOUT" || type === "UPSTREAM_ERROR" || type === "UNKNOWN";
}

async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

function extractTriggers(desc: string, name: string): string[] {
  const words = desc.split(/[\s,，。、；]+/).filter((w) => w.length > 1);
  const keywords = words.slice(0, 8);
  if (keywords.length === 0) keywords.push(name);
  return keywords;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const userId = (session.user as { id: string; role?: string }).id as string;
  const userRole = (session.user as { id: string; role?: string }).role as string;

  const {
    agentId,
    conversationId,
    message,
    activeSkills,
    files,
    model: modelOverride,
    ragMode = "off",
    ragProductId = "general",
    webSearchEnabled = false,
  } = (await req.json()) as ChatRequestBody;
  if (!conversationId) {
    return Response.json({ error: "缺少必要参数" }, { status: 400 });
  }

  let agent: (typeof agents.$inferSelect) | null = null;
  if (agentId) {
    const [found] = db.select().from(agents).where(eq(agents.id, agentId)).all();
    if (!found) return Response.json({ error: "Agent 不存在" }, { status: 404 });
    const canAccess = userRole === "admin" || found.reviewStatus === "approved" || found.createdBy === userId;
    if (!canAccess) return Response.json({ error: "无权限访问该 Agent" }, { status: 403 });
    agent = found;
  }

  const [conv] = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .all();
  if (!conv) return Response.json({ error: "对话不存在" }, { status: 404 });

  let apiKey: string;
  let baseUrl: string;

  if (agent?.providerId) {
    const [provider] = db.select().from(apiProviders).where(eq(apiProviders.id, agent.providerId)).all();
    if (!provider) return Response.json({ error: "提供商不存在" }, { status: 500 });
    if (!provider.apiKey) return Response.json({ error: `提供商 "${provider.name}" 未配置密钥` }, { status: 500 });
    apiKey = provider.apiKey;
    baseUrl = provider.baseUrl;
  } else {
    const [keySetting] = db.select().from(settings).where(eq(settings.key, "llm_api_key")).all();
    const [urlSetting] = db.select().from(settings).where(eq(settings.key, "llm_base_url")).all();
    if (!keySetting?.value) return Response.json({ error: "未配置 API 密钥" }, { status: 500 });
    apiKey = keySetting.value;
    baseUrl = urlSetting?.value || "https://api.minimaxi.com";
  }

  setMiniMaxConfig(apiKey, baseUrl);
  const requestId = crypto.randomUUID();

  // Build user content: store placeholder text, attach images to LLM message
  const fileList = Array.isArray(files) ? files : [];
  const hasImages = fileList.some((f) => f.kind === "image");
  const hasOffice = fileList.some((f) => f.kind === "office");
  const placeholders: string[] = [];
  if (hasImages) placeholders.push(`图片 ${fileList.filter((f) => f.kind === "image").length} 张`);
  if (hasOffice) placeholders.push(`文件 ${fileList.filter((f) => f.kind === "office").map((f) => f.name).join(", ")}`);
  const dbContent = placeholders.length > 0 ? `[${placeholders.join(", ")}] ${message || ""}` : (message || "");

  db.insert(messages).values({
    id: crypto.randomUUID(),
    conversationId,
    role: "user",
    content: dbContent,
    createdAt: new Date().toISOString(),
  }).run();

  db.update(conversations)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(conversations.id, conversationId))
    .run();

  const historyMessages = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .all();

  const linkedSkills = agentId
    ? db.select().from(agentSkills).where(eq(agentSkills.agentId, agentId)).all()
    : [];

  let toolNames: string[] | undefined;
  const skillList: string[] = [];
  const skillMap: Record<string, { id: string; prompt: string; dir: string }> = {};

  if (linkedSkills.length > 0) {
    const skillIds = linkedSkills.map((s) => s.skillId);
    const agentSkillsData = db.select().from(skills).where(inArray(skills.id, skillIds)).all();
    const toolNameSet = new Set<string>();

    for (const skill of agentSkillsData) {
      const triggers = extractTriggers(skill.description, skill.name);
      skillList.push(`- ${skill.name}: ${skill.description}\n  Triggers: ${triggers.join(", ")}`);
      
      const bundle = buildSkillPromptBundle(skill.id, skill.systemPrompt);
      skillMap[skill.name] = {
        id: skill.id,
        prompt: bundle.prompt,
        dir: `AGENT/data/skills/${skill.id}`,
      };

      try {
        const allowed = JSON.parse(skill.toolsAllowed);
        if (Array.isArray(allowed)) allowed.forEach((t: string) => toolNameSet.add(t));
      } catch {}
    }
    toolNames = [...toolNameSet];
  }

  // Always expose load_skill and discover_skill_files when skills are available
  if (linkedSkills.length > 0) {
    if (!toolNames) toolNames = [];
    for (const t of ["load_skill", "discover_skill_files"]) {
      if (!toolNames.includes(t)) toolNames.push(t);
    }
  }

  const skillSection = skillList.length > 0
    ? `\n## Available Skills\nYou have these skills available. Use \`load_skill\` to load a skill's complete instructions and files when you need it.\n${skillList.join("\n")}`
    : "";

  // Directly inject active skills (selected by user in UI)
  const activeInjects: string[] = [];
  if (activeSkills && Array.isArray(activeSkills) && activeSkills.length > 0) {
    const validSkills: { id: string; prompt: string; dir: string }[] = [];
    const missingNames = activeSkills.filter((name: string) => !skillMap[name]);

    if (missingNames.length > 0) {
      const allDbSkills = db.select().from(skills).all();
      for (const name of missingNames) {
        const found = allDbSkills.find((s) => s.name === name);
        if (found) {
          const bundle = buildSkillPromptBundle(found.id, found.systemPrompt);
          skillMap[found.name] = {
            id: found.id,
            prompt: bundle.prompt,
            dir: `AGENT/data/skills/${found.id}`,
          };
        }
      }
    }

    for (const name of activeSkills) {
      const sk = skillMap[name];
      if (sk) validSkills.push(sk);
    }

    for (const sk of validSkills) {
      let files = "";
      try {
        const dir = join(process.cwd(), "data", "skills", sk.id);
        const items = readdirSync(dir);
        files = items.join(", ");
      } catch {}
      activeInjects.push(
        `--- Loaded Skill: ${sk.id} ---\n${sk.prompt}\n\nSkill directory: ${sk.dir}\nFiles: ${files}\n--- End Skill ---`
      );
    }
  }
  const activeSection = activeInjects.length > 0 ? "\n\n" + activeInjects.join("\n\n") : "";

  const systemPrompt = [
    agent?.systemPrompt || "你是一个全能AI助手。帮助用户解决各种问题，提供清晰、准确、有帮助的回答。",
    skillSection,
    activeSection,
    webSearchEnabled ? "联网搜索已开启：可在需要最新信息时使用 web_search / web_fetch，并在回答中给出来源。" : "联网搜索已关闭：禁止调用 web_search / web_fetch。",
    toolNames && toolNames.length > 0
      ? `\nAvailable tools: ${toolNames.join(", ")}. Use them when appropriate to complete the task.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const llmMessages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages.map((m) => {
      const role: LLMMessage["role"] =
        m.role === "user" || m.role === "assistant" || m.role === "tool" || m.role === "system"
          ? m.role
          : "assistant";
      const msg: LLMMessage = { role, content: m.content };
      if (m.toolExecutions) {
        try {
          const execs = JSON.parse(m.toolExecutions) as StoredToolExecution[];
          msg.tool_calls = execs.map((e) => ({
            id: e.id,
            type: "function" as const,
            function: { name: e.name, arguments: e.input },
          }));
        } catch {}
      }
      return msg;
    }),
  ];

  // Add the current user message with file attachments
  const userMsg: LLMMessage = { role: "user", content: message || "" };
  if (fileList.length > 0) {
    const images = fileList.filter((f): f is UploadedFile & { data: string } => f.kind === "image" && !!f.data);
    const textFiles = fileList.filter((f): f is UploadedFile & { data: string } => f.kind === "text" && !!f.data);
    
    if (images.length > 0) {
      userMsg.images = images.map((f) => ({ type: f.type || "image/png", data: f.data }));
    }
    if (textFiles.length > 0) {
      const prefix = textFiles.map((f) => `--- ${f.name} ---\n${Buffer.from(f.data, "base64").toString("utf-8")}`).join("\n\n");
      userMsg.content = (message || "") + `\n\n${prefix}`;
    }

    const officeFiles = fileList.filter((f): f is UploadedFile & { data: string } => f.kind === "office" && !!f.data);
    if (officeFiles.length > 0) {
      const parsed = await Promise.all(
        officeFiles.map(async (f) => {
          try {
            const buf = Buffer.from(f.data, "base64");
            const text = await parseOfficeFile(buf, f.name);
            return `--- ${f.name} ---\n${text}`;
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return `--- ${f.name} ---\n[解析失败] ${message}`;
          }
        })
      );
      userMsg.content = (userMsg.content || "") + "\n\n" + parsed.join("\n\n");
    }

    const totalFiles = fileList.length;
    if (totalFiles >= 2) {
      const names = fileList.map((f) => f.name).join("、");
      userMsg.content = (userMsg.content || "") + `\n\n[系统提示]: 用户同时上传了 ${totalFiles} 个文件（${names}）。请对这些文件进行综合分析，注意对比和关联它们之间的信息。`;
    }
  }

  const ragStart = Date.now();
  const ragChunks = ragMode === "off"
    ? []
    : searchRagChunks({
      tenantId: userId,
      productId: ragProductId || "general",
      query: message || "",
      topK: ragMode === "full" ? 8 : 5,
      sensitivityList: userRole === "admin" ? ["public", "internal", "restricted"] : ["public", "internal"],
    });
  const ragSearchMs = Date.now() - ragStart;
  const ragContext = buildRagContext(ragMode, ragChunks);
  if (ragContext) {
    userMsg.content = `${userMsg.content || ""}\n\n[知识库参考]\n${ragContext}\n\n[写作规则]\n产品事实必须严格依据资料，表达允许润色改写；资料不足时请明确指出。`;
  }
  llmMessages.push(userMsg);

  const totalLen = llmMessages.reduce((s, m) => s + (m.content || "").length, 0);
  if (totalLen > 80000 && llmMessages.length > 2) {
    const keep = [llmMessages[0], ...llmMessages.slice(-10)];
    llmMessages.splice(0, llmMessages.length, ...keep);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      const toolCalls: ToolCallEvent[] = [];

      // Pre-process images: use MIMO vision API (OpenAI-compatible, supports base64 images)
      if (userMsg.images && userMsg.images.length > 0) {
        try {
          const [visionKeySetting] = db.select().from(settings).where(eq(settings.key, "vision_api_key")).all();
          const [visionModelSetting] = db.select().from(settings).where(eq(settings.key, "vision_model")).all();
          const visionKey = visionKeySetting?.value;

          if (visionKey) {
            const visionModel = visionModelSetting?.value || "mimo-v2.5";
            const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
              { type: "text", text: userMsg.content || "Describe these images in detail in Chinese." },
            ];
            for (const img of userMsg.images) {
              parts.push({ type: "image_url", image_url: { url: `data:${img.type};base64,${img.data}` } });
            }
            const visionRes = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": visionKey },
              body: JSON.stringify({ model: visionModel, temperature: 0.3, messages: [{ role: "user", content: parts }] }),
              signal: AbortSignal.timeout(180000),
            });
            if (visionRes.ok) {
              const visionData = await visionRes.json();
              const descText = visionData.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "";
              if (descText) {
                userMsg.content = (userMsg.content || "") + `\n\n---\n[视觉AI分析]: 已自动分析用户上传的图片，内容如下：\n${descText}\n\n(以上分析为系统自动生成，不是用户输入的内容)\n---`;
              }
              userMsg.images = undefined;
            } else {
              emit({ type: "text", content: `[识图失败] MIMO API ${visionRes.status}` });
            }
          } else {
            emit({ type: "text", content: "[识图] 未配置识图 API Key，请在管理后台设置" });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          emit({ type: "text", content: `[识图异常] ${message}` });
        }
      }
      let fullResponse = "";
      let ragQueryLogId: string | undefined;

      const allTools = [...getToolList()].filter((t) => {
        if (webSearchEnabled) return true;
        return t.function.name !== "web_search" && t.function.name !== "web_fetch";
      });
      const enabledTools: ToolDef[] = toolNames
        ? allTools.filter((t) => toolNames.includes(t.function.name))
        : allTools;

      try {
        for (let i = 0; i < (agent?.maxIterations || 5); i++) {
          const response = await callLLM(llmMessages, {
            apiKey,
            baseUrl,
            model: modelOverride || agent?.model || "MiniMax-M2.7",
            temperature: parseFloat(agent?.temperature || "0.7"),
            tools: enabledTools.length > 0 ? enabledTools : undefined,
          });

          if (response.think) {
            emit({ type: "think", content: response.think });
          }

          if (response.tool_calls && response.tool_calls.length > 0) {
            llmMessages.push({
              role: "assistant",
              content: response.content,
              tool_calls: response.tool_calls,
            });

            for (const tc of response.tool_calls) {
              const start = Date.now();
              let output: string;
              let ok = true;
              let errorType: ToolErrorType | undefined;
              let retryable = false;
              let attempt = 1;

              try {
                const circuit = toolCircuit.get(tc.function.name);
                if (circuit && circuit.openUntil > Date.now()) {
                  throw new Error(`Tool circuit is open (${Math.ceil((circuit.openUntil - Date.now()) / 1000)}s remaining)`);
                }

                const runToolOnce = async (): Promise<string> => {
                  const args = JSON.parse(tc.function.arguments);

                  if (tc.function.name === "load_skill") {
                    const [skill] = db.select().from(skills).where(eq(skills.name, args.name)).all();
                    if (skill) {
                      const bundle = buildSkillPromptBundle(skill.id, skill.systemPrompt);
                      llmMessages.push({
                        role: "user",
                        content: `[System: Loaded Skill "${skill.name}"]\n\n${bundle.prompt}\n\nSkill directory: AGENT/data/skills/${skill.id}\nUse shell_exec with workdir="AGENT/data/skills/${skill.id}" to run scripts.\nUse read_file with path="AGENT/data/skills/${skill.id}/filename" to read docs.\n[/System]`,
                      });
                      return JSON.stringify({
                        loaded: true,
                        name: skill.name,
                        prompt: bundle.prompt,
                        dir: `AGENT/data/skills/${skill.id}`,
                        files: bundle.filesTree,
                      });
                    }
                    const all = db.select().from(skills).all();
                    throw new Error(`Skill "${args.name}" not found. Available: ${all.map((s) => s.name).join(", ")}`);
                  }

                  const handler = getToolHandler(tc.function.name);
                  if (!handler) throw new Error(`Unknown tool: ${tc.function.name}`);
                  return executeWithTimeout(() => handler(args, { userId, role: userRole }), TOOL_EXEC_TIMEOUT_MS);
                };

                try {
                  output = await runToolOnce();
                } catch (firstErr: unknown) {
                  const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr);
                  const firstType = classifyToolError(firstMessage, tc.function.name);
                  const firstRetryable = isRetryableError(firstType) && IDEMPOTENT_TOOLS.has(tc.function.name);
                  if (firstRetryable) {
                    attempt = 2;
                    await sleep(200);
                    output = await runToolOnce();
                  } else {
                    throw firstErr;
                  }
                }

                toolCircuit.set(tc.function.name, { consecutiveFailures: 0, openUntil: 0 });
              } catch (err: unknown) {
                output = err instanceof Error ? err.message : String(err);
                ok = false;
                errorType = classifyToolError(output, tc.function.name);
                retryable = isRetryableError(errorType) && IDEMPOTENT_TOOLS.has(tc.function.name);
                const prev = toolCircuit.get(tc.function.name) || { consecutiveFailures: 0, openUntil: 0 };
                const failures = prev.consecutiveFailures + 1;
                const openUntil = failures >= CIRCUIT_FAILURE_THRESHOLD ? Date.now() + CIRCUIT_OPEN_MS : 0;
                toolCircuit.set(tc.function.name, { consecutiveFailures: failures, openUntil });
              }

              const durationMs = Date.now() - start;
              toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                input: tc.function.arguments,
                output,
                ok,
                durationMs,
                requestId,
                errorType,
                retryable,
                attempt,
              });

              emit({
                type: "tool",
                id: tc.id,
                name: tc.function.name,
                input: tc.function.arguments,
                output,
                ok,
                durationMs,
                requestId,
                errorType,
                retryable,
                attempt,
              });

              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                name: tc.function.name,
                content: output,
              });
            }
            continue;
          }

          fullResponse = (response.content || "").trim();
          if (!fullResponse) {
            fullResponse = toolCalls.length > 0
              ? "已完成联网检索，但未生成有效正文。请重试，或把问题改得更具体一些。"
              : "未生成有效回复，请重试一次。";
          }
          emit({ type: "text", content: fullResponse });
          emit({ type: "done" });

          const toolExecsJson = JSON.stringify(toolCalls);
          db.insert(messages).values({
            id: crypto.randomUUID(),
            conversationId,
            role: "assistant",
            content: fullResponse,
            toolExecutions: toolExecsJson,
            createdAt: new Date().toISOString(),
          }).run();

          if (ragMode !== "off") {
            ragQueryLogId = logRagQuery({
              tenantId: userId,
              userId,
              conversationId,
              productId: ragProductId || "general",
              ragMode,
              query: message || "",
              rewrittenQuery: message || "",
              chunks: ragChunks,
              latencySearchMs: ragSearchMs,
              latencyTotalMs: Date.now() - ragStart,
            });
            logRagAnswer({
              queryLogId: ragQueryLogId,
              tenantId: userId,
              userId,
              ragMode,
              answer: fullResponse,
              chunks: ragChunks,
            });
          }

          controller.close();
          return;
        }

        emit({ type: "text", content: "(已达到最大迭代次数)" });
        emit({ type: "done" });
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (ragMode !== "off") {
          logRagAnswer({
            tenantId: userId,
            userId,
            ragMode,
            answer: "",
            chunks: ragChunks,
            errorMessage: message,
          });
        }
        emit({ type: "error", content: message });
        emit({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
