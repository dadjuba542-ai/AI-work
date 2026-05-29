import { auth } from "@/auth";
import { searchRagChunks, type RagMode } from "@/lib/rag";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const tenantId = (session.user as { id: string; role?: string }).id;
  const role = (session.user as { id: string; role?: string }).role || "user";

  const body = await req.json().catch(() => ({}));
  const query = String(body.query || "").trim();
  const productId = String(body.productId || "general");
  const ragMode = String(body.ragMode || "summary") as RagMode;
  if (!query) return Response.json({ error: "query 不能为空" }, { status: 400 });

  const chunks = searchRagChunks({
    tenantId,
    productId,
    query,
    topK: ragMode === "full" ? 8 : 5,
    sensitivityList: role === "admin" ? ["public", "internal", "restricted"] : ["public", "internal"],
  });

  return Response.json({ chunks });
}
