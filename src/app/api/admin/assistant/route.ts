import { auth } from "@/auth";
import { db } from "@/db";
import { agents, messages, settings, users } from "@/db/schema";
import { callLLM, type LLMMessage } from "@/lib/llm";
import { eq, gte } from "drizzle-orm";

type ToolCallEvent = {
  name?: string;
  ok?: boolean;
  output?: string;
  durationMs?: number;
  errorType?: string;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const body = (await req.json()) as { prompt?: string };
  const prompt = (body.prompt || "").trim();
  if (!prompt) return Response.json({ error: "请输入问题" }, { status: 400 });

  const [keySetting] = db.select().from(settings).where(eq(settings.key, "llm_api_key")).all();
  const [urlSetting] = db.select().from(settings).where(eq(settings.key, "llm_base_url")).all();
  if (!keySetting?.value) return Response.json({ error: "未配置 LLM API 密钥" }, { status: 500 });
  const apiKey = keySetting.value;
  const baseUrl = urlSetting?.value || "https://api.minimaxi.com";

  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const toolRows = db
    .select({ createdAt: messages.createdAt, toolExecutions: messages.toolExecutions })
    .from(messages)
    .where(gte(messages.createdAt, since7d))
    .all();

  let totalCalls = 0;
  let failedCalls = 0;
  const durations: number[] = [];
  const errors = new Map<string, { tool: string; errorType: string; count: number; sample: string }>();
  const recentFailures: Array<{ at: string; tool: string; errorType: string; output: string }> = [];

  for (const row of toolRows) {
    if (!row.toolExecutions) continue;
    let parsed: ToolCallEvent[] = [];
    try {
      const json = JSON.parse(row.toolExecutions) as unknown;
      if (Array.isArray(json)) parsed = json as ToolCallEvent[];
    } catch {
      continue;
    }
    for (const evt of parsed) {
      const tool = evt.name || "unknown";
      const ok = !!evt.ok;
      const dur = Number(evt.durationMs) || 0;
      totalCalls += 1;
      durations.push(dur);
      if (!ok) {
        failedCalls += 1;
        const errorType = evt.errorType || "UNKNOWN";
        const key = `${tool}::${errorType}`;
        const item = errors.get(key) || { tool, errorType, count: 0, sample: (evt.output || "").slice(0, 180) };
        item.count += 1;
        errors.set(key, item);
        recentFailures.push({
          at: row.createdAt,
          tool,
          errorType,
          output: (evt.output || "").slice(0, 180),
        });
      }
    }
  }

  const agentCount = db.select({ id: agents.id }).from(agents).all().length;
  const adminCount = db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).all().length;
  const userCount = db.select({ id: users.id }).from(users).all().length;
  const [visionKey] = db.select().from(settings).where(eq(settings.key, "vision_api_key")).all();
  const [visionModel] = db.select().from(settings).where(eq(settings.key, "vision_model")).all();

  const topErrors = [...errors.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  const latestFailures = recentFailures.sort((a, b) => (a.at > b.at ? -1 : 1)).slice(0, 12);
  const successRate = totalCalls > 0 ? Number((((totalCalls - failedCalls) / totalCalls) * 100).toFixed(1)) : 100;

  const snapshot = {
    generatedAt: new Date().toISOString(),
    scope: "last_7_days",
    summary: {
      totalCalls,
      failedCalls,
      successRate,
      p95DurationMs: Math.round(percentile(durations, 95)),
      avgDurationMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    },
    topErrors,
    recentFailures: latestFailures,
    system: {
      users: userCount,
      admins: adminCount,
      agents: agentCount,
      hasLlmKey: !!keySetting?.value,
      hasVisionKey: !!visionKey?.value,
      visionModel: visionModel?.value || "",
    },
  };

  const llmMessages: LLMMessage[] = [
    {
      role: "system",
      content:
        "你是管理员后台AI助手。你必须基于给定后台快照给出运维建议：先给结论，再给根因分析，再给可执行修复步骤。若信息不足，明确指出缺口并给出最小补充数据清单。",
    },
    {
      role: "user",
      content: `后台快照：\n${JSON.stringify(snapshot, null, 2)}\n\n管理员问题：${prompt}`,
    },
  ];

  const response = await callLLM(llmMessages, {
    apiKey,
    baseUrl,
    model: "MiniMax-M2.7",
    temperature: 0.2,
  });

  return Response.json({
    answer: response.content || "暂无可用回答",
    snapshot,
  });
}
