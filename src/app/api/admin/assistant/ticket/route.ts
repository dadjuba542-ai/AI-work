import { auth } from "@/auth";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { callLLM, type LLMMessage } from "@/lib/llm";
import { eq } from "drizzle-orm";

type Snapshot = {
  generatedAt?: string;
  summary?: {
    totalCalls?: number;
    failedCalls?: number;
    successRate?: number;
    p95DurationMs?: number;
    avgDurationMs?: number;
  };
  topErrors?: Array<{ tool?: string; errorType?: string; count?: number; sample?: string }>;
  recentFailures?: Array<{ at?: string; tool?: string; errorType?: string; output?: string }>;
};

type TicketRequest = {
  question?: string;
  answer?: string;
  snapshot?: Snapshot;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const body = (await req.json()) as TicketRequest;
  const question = (body.question || "").trim();
  const answer = (body.answer || "").trim();
  const snapshot = body.snapshot || {};
  if (!question || !answer) {
    return Response.json({ error: "缺少分析问题或分析结论" }, { status: 400 });
  }

  const [keySetting] = db.select().from(settings).where(eq(settings.key, "llm_api_key")).all();
  const [urlSetting] = db.select().from(settings).where(eq(settings.key, "llm_base_url")).all();
  if (!keySetting?.value) return Response.json({ error: "未配置 LLM API 密钥" }, { status: 500 });

  const llmMessages: LLMMessage[] = [
    {
      role: "system",
      content:
        "你是资深技术负责人。请把给定分析结果整理为可执行的修复工单。必须输出 Markdown，包含：标题、优先级、问题摘要、影响范围、根因假设、执行步骤（按顺序编号）、验收标准、验证命令、回滚方案、交付物清单。内容要短、可执行、可直接交给 Coding Agent。",
    },
    {
      role: "user",
      content:
        `管理员问题：${question}\n\n` +
        `分析结论：\n${answer}\n\n` +
        `监控快照：\n${JSON.stringify(snapshot, null, 2)}`,
    },
  ];

  const completion = await callLLM(llmMessages, {
    apiKey: keySetting.value,
    baseUrl: urlSetting?.value || "https://api.minimaxi.com",
    model: "MiniMax-M2.7",
    temperature: 0.2,
  });

  const markdown = completion.content || "# 修复工单\n\n未生成内容。";
  return Response.json({
    markdown,
    generatedAt: new Date().toISOString(),
  });
}
