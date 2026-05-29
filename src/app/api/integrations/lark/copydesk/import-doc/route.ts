import { auth } from "@/auth";
import { importLarkDocAsHtml } from "@/lib/integrations/lark";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const doc = String(body.doc || "").trim();
  if (!doc) return Response.json({ error: "doc 不能为空" }, { status: 400 });

  try {
    const data = await importLarkDocAsHtml(doc);
    return Response.json(data);
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "导入失败" }, { status: 400 });
  }
}
