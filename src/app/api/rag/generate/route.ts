import { auth } from "@/auth";
import { buildRagContext, logRagAnswer, logRagQuery, searchRagChunks, type RagMode } from "@/lib/rag";
import { callLLM, type LLMMessage } from "@/lib/llm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const tenantId = (session.user as { id: string; role?: string }).id;
  const userId = (session.user as { id: string; role?: string }).id;
  const role = (session.user as { id: string; role?: string }).role || "user";

  const body = await req.json().catch(() => ({}));
  const query = String(body.query || "").trim();
  const productId = String(body.productId || "general");
  const ragMode = String(body.ragMode || "summary") as RagMode;
  if (!query) return Response.json({ error: "query 不能为空" }, { status: 400 });

  const t0 = Date.now();
  const chunks = ragMode === "off" ? [] : searchRagChunks({
    tenantId,
    productId,
    query,
    topK: ragMode === "full" ? 8 : 5,
    sensitivityList: role === "admin" ? ["public", "internal", "restricted"] : ["public", "internal"],
  });
  const searchMs = Date.now() - t0;

  const ragContext = buildRagContext(ragMode, chunks);
  const prompt = `你是产品文案助手。\n规则：产品事实、参数、限制必须来自资料；表达可润色改写；资料不足时明确指出。\n\n${ragContext ? `[资料]\n${ragContext}\n\n` : ""}[用户需求]\n${query}`;

  const [keySetting] = db.select().from(settings).where(eq(settings.key, "llm_api_key")).all();
  const [urlSetting] = db.select().from(settings).where(eq(settings.key, "llm_base_url")).all();
  if (!keySetting?.value) return Response.json({ error: "未配置 API 密钥" }, { status: 500 });

  const messages: LLMMessage[] = [
    { role: "system", content: "你是严谨的产品文案助手。" },
    { role: "user", content: prompt },
  ];

  try {
    const ret = await callLLM(messages, {
      apiKey: keySetting.value,
      baseUrl: urlSetting?.value || "https://api.minimaxi.com",
      model: String(body.model || "MiniMax-M2.7"),
      temperature: 0.6,
    });
    const answer = ret.content || "";
    const qid = logRagQuery({
      tenantId,
      userId,
      productId,
      ragMode,
      query,
      rewrittenQuery: query,
      chunks,
      latencySearchMs: searchMs,
      latencyTotalMs: Date.now() - t0,
    });
    logRagAnswer({ queryLogId: qid, tenantId, userId, ragMode, answer, chunks });
    return Response.json({ answer, citations: chunks.map((x) => ({ chunkId: x.chunkId, title: x.documentTitle, version: x.documentVersion })) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "生成失败";
    logRagAnswer({ tenantId, userId, ragMode, answer: "", chunks, errorMessage: msg });
    return Response.json({ error: msg }, { status: 500 });
  }
}
