import { auth } from "@/auth";
import { db } from "@/db";
import { kbDocuments } from "@/db/schema";
import { ensureRagTables } from "@/lib/rag";
import { and, desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const tenantId = (session.user as { id: string }).id;
  ensureRagTables();
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") || "general";
  const docs = db
    .select()
    .from(kbDocuments)
    .where(and(eq(kbDocuments.tenantId, tenantId), eq(kbDocuments.productId, productId)))
    .orderBy(desc(kbDocuments.createdAt))
    .all();
  return Response.json({ items: docs });
}
