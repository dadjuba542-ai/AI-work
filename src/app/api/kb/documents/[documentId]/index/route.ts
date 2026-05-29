import { auth } from "@/auth";
import { db } from "@/db";
import { kbDocuments, kbIndexJobs } from "@/db/schema";
import { runIndexJob } from "@/lib/rag";
import { ensureRagTables } from "@/lib/rag";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const tenantId = (session.user as { id: string }).id;
  ensureRagTables();
  const { documentId } = await params;

  const [doc] = db
    .select()
    .from(kbDocuments)
    .where(and(eq(kbDocuments.id, documentId), eq(kbDocuments.tenantId, tenantId)))
    .all();
  if (!doc) return Response.json({ error: "文档不存在" }, { status: 404 });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.insert(kbIndexJobs).values({
    id,
    tenantId,
    documentId,
    jobType: "index",
    status: "pending",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  }).run();

  setTimeout(() => {
    runIndexJob(id).catch(() => undefined);
  }, 10);

  return Response.json({ jobId: id, status: "pending" }, { status: 202 });
}
