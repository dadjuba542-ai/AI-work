import { auth } from "@/auth";
import { db } from "@/db";
import { kbAnswerLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const answerLogId = String(body.answerLogId || "");
  const feedback = String(body.feedback || "").slice(0, 300);
  if (!answerLogId) return Response.json({ error: "缺少 answerLogId" }, { status: 400 });

  const [row] = db.select().from(kbAnswerLogs).where(eq(kbAnswerLogs.id, answerLogId)).all();
  if (!row) return Response.json({ error: "记录不存在" }, { status: 404 });

  db.update(kbAnswerLogs).set({ errorMessage: feedback || row.errorMessage }).where(eq(kbAnswerLogs.id, answerLogId)).run();
  return Response.json({ ok: true });
}
