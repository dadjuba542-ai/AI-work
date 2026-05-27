import { auth } from "@/auth";
import { db } from "@/db";
import { agents, conversations, messages, settings, apiProviders, skills, agentSkills } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { callLLM, LLMMessage } from "@/lib/llm";
import { getToolHandler, getToolList, setMiniMaxConfig } from "@/lib/tools";
import type { ToolDef } from "@/lib/llm";
import { join } from "path";
import { readdirSync } from "fs";

interface ToolCallEvent {
  id: string;
  name: string;
  input: string;
  output: string;
  ok: boolean;
  durationMs: number;
}

function extractTriggers(desc: string, name: string): string[] {
  const words = desc.split(/[\s,，。、；]+/).filter((w) => w.length > 1);
  const keywords = words.slice(0, 8);
  if (keywords.length === 0) keywords.push(name);
  return keywords;
}

function s(msg: string): string {
  return JSON.stringify(msg);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { agentId, conversationId, message, activeSkills, files } = await req.json();
  if (!agentId || !conversationId) {
    return Response.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const [agent] = db.select().from(agents).where(eq(agents.id, agentId)).all();
  if (!agent) return Response.json({ error: "Agent 不存在" }, { status: 404 });

  const [conv] = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, (session.user as any).id)))
    .all();
  if (!conv) return Response.json({ error: "对话不存在" }, { status: 404 });

  let apiKey: string;
  let baseUrl: string;

  if (agent.providerId) {
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

  // Build user content: store placeholder text, attach images to LLM message
  const hasImages = files && Array.isArray(files) && files.some((f: any) => f.kind === "image");
  const dbContent = hasImages ? `[图片 ${files.filter((f: any) => f.kind === "image").length} 张] ${message || ""}` : message || "";

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

  const linkedSkills = db
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.agentId, agentId))
    .all();

  let toolNames: string[] | undefined;
  let skillList: string[] = [];
  let skillMap: Record<string, { id: string; prompt: string; dir: string }> = {};

  if (linkedSkills.length > 0) {
    const skillIds = linkedSkills.map((s) => s.skillId);
    const agentSkillsData = db.select().from(skills).where(inArray(skills.id, skillIds)).all();
    const toolNameSet = new Set<string>();
    const SKILLS_DIR = join(process.cwd(), "data", "skills");

    for (const skill of agentSkillsData) {
      const triggers = extractTriggers(skill.description, skill.name);
      skillList.push(`- ${skill.name}: ${skill.description}\n  Triggers: ${triggers.join(", ")}`);
      
      skillMap[skill.name] = {
        id: skill.id,
        prompt: skill.systemPrompt,
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
  let activeInjects: string[] = [];
  if (activeSkills && Array.isArray(activeSkills) && activeSkills.length > 0) {
    const validSkills = Object.entries(skillMap)
      .filter(([name]) => activeSkills.includes(name))
      .map(([_, data]) => data);

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
    agent.systemPrompt,
    skillSection,
    activeSection,
    toolNames && toolNames.length > 0
      ? `\nAvailable tools: ${toolNames.join(", ")}. Use them when appropriate to complete the task.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const llmMessages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages.map((m) => {
      const msg: LLMMessage = { role: m.role as any, content: m.content };
      if (m.toolExecutions) {
        try {
          const execs = JSON.parse(m.toolExecutions);
          msg.tool_calls = execs.map((e: any) => ({
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
  if (files && Array.isArray(files) && files.length > 0) {
    const images = files.filter((f: any) => f.kind === "image" && f.data);
    const textFiles = files.filter((f: any) => f.kind === "text" && f.data);
    
    if (images.length > 0) {
      userMsg.images = images.map((f: any) => ({ type: f.type || "image/png", data: f.data }));
    }
    if (textFiles.length > 0) {
      const prefix = textFiles.map((f: any) => `--- ${f.name} ---\n${Buffer.from(f.data, "base64").toString("utf-8")}`).join("\n\n");
      userMsg.content = (message || "") + `\n\n${prefix}`;
    }
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
      const emit = (data: any) => controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      const toolCalls: ToolCallEvent[] = [];

      // Pre-process images: use MIMO vision API (OpenAI-compatible, supports base64 images)
      if (userMsg.images && userMsg.images.length > 0) {
        try {
          const [visionKeySetting] = db.select().from(settings).where(eq(settings.key, "vision_api_key")).all();
          const [visionModelSetting] = db.select().from(settings).where(eq(settings.key, "vision_model")).all();
          const visionKey = visionKeySetting?.value;

          if (visionKey) {
            const visionModel = visionModelSetting?.value || "mimo-v2.5";
            const parts: any[] = [{ type: "text", text: userMsg.content || "Describe these images in detail in Chinese." }];
            for (const img of userMsg.images) {
              parts.push({ type: "image_url", image_url: { url: `data:${img.type};base64,${img.data}` } });
            }
            const visionRes = await fetch("https://api.xiaomimimo.com/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "api-key": visionKey },
              body: JSON.stringify({ model: visionModel, temperature: 0.3, messages: [{ role: "user", content: parts }] }),
              signal: AbortSignal.timeout(60000),
            });
            if (visionRes.ok) {
              const visionData = await visionRes.json();
              const descText = visionData.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "";
              if (descText) {
                userMsg.content = (userMsg.content || "") + `\n\n[图片描述]:\n${descText}`;
              }
            } else {
              emit({ type: "text", content: `[识图失败] MIMO API ${visionRes.status}` });
            }
          } else {
            emit({ type: "text", content: "[识图] 未配置识图 API Key，请在管理后台设置" });
          }
        } catch (err: any) {
          emit({ type: "text", content: `[识图异常] ${err.message}` });
        }
        userMsg.images = undefined;
      }
      let fullResponse = "";

      const allTools = [...getToolList()];
      const enabledTools: ToolDef[] = toolNames
        ? allTools.filter((t) => toolNames.includes(t.function.name))
        : allTools;

      try {
        for (let i = 0; i < (agent.maxIterations || 5); i++) {
          const response = await callLLM(llmMessages, {
            apiKey,
            baseUrl,
            model: agent.model,
            temperature: parseFloat(agent.temperature),
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

              try {
                const args = JSON.parse(tc.function.arguments);

                if (tc.function.name === "load_skill") {
                  const [skill] = db.select().from(skills).where(eq(skills.name, args.name)).all();
                  if (skill) {
                    const dirPath = join(process.cwd(), "data", "skills", skill.id);
                    let files = "";
                    try { files = readdirSync(dirPath).join(", "); } catch {}
                    output = JSON.stringify({ loaded: true, name: skill.name, prompt: skill.systemPrompt, dir: `AGENT/data/skills/${skill.id}`, files });
                    llmMessages.push({
                      role: "user",
                      content: `[System: Loaded Skill "${skill.name}"]\n\n${skill.systemPrompt}\n\nSkill directory: AGENT/data/skills/${skill.id}\nUse shell_exec with workdir="AGENT/data/skills/${skill.id}" to run scripts.\nUse read_file with path="AGENT/data/skills/${skill.id}/filename" to read docs.\n[/System]`,
                    });
                  } else {
                    const all = db.select().from(skills).all();
                    output = `Skill "${args.name}" not found. Available: ${all.map((s) => s.name).join(", ")}`;
                    ok = false;
                  }
                } else {
                  const handler = getToolHandler(tc.function.name);
                  if (handler) {
                    output = await handler(args);
                  } else {
                    output = `Unknown tool: ${tc.function.name}`;
                    ok = false;
                  }
                }
              } catch (err: any) {
                output = err.message || String(err);
                ok = false;
              }

              toolCalls.push({
                id: tc.id,
                name: tc.function.name,
                input: tc.function.arguments,
                output,
                ok,
                durationMs: Date.now() - start,
              });

              emit({ type: "tool", id: tc.id, name: tc.function.name, input: tc.function.arguments, output, ok, durationMs: Date.now() - start });

              llmMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                name: tc.function.name,
                content: output,
              });
            }
            continue;
          }

          fullResponse = response.content || "";
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

          controller.close();
          return;
        }

        emit({ type: "text", content: "(已达到最大迭代次数)" });
        emit({ type: "done" });
        controller.close();
      } catch (err: any) {
        emit({ type: "error", content: err.message });
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
