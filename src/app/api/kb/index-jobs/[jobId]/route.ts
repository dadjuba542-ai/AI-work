import { auth } from "@/auth";
import { db } from "@/db";
import { kbIndexJobs } from "@/db/schema";
import { ensureRagTables } from "@/lib/rag";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const tenantId = (session.user as { id: string }).id;
  ensureRagTables();
  const { jobId } = await params;
  const [job] = db.select().from(kbIndexJobs).where(and(eq(kbIndexJobs.id, jobId), eq(kbIndexJobs.tenantId, tenantId))).all();
  if (!job) return Response.json({ error: "任务不存在" }, { status: 404 });
  return Response.json(job);
}
