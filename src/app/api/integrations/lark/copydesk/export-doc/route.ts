import { auth } from "@/auth";
import { exportCopydeskToLarkDoc } from "@/lib/integrations/lark";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const html = String(body.html || "").trim();
  const title = String(body.title || "AI Work 文案导出");
  if (!html) return Response.json({ error: "html 不能为空" }, { status: 400 });

  try {
    const data = await exportCopydeskToLarkDoc(title, html);
    return Response.json(data);
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "导出失败" }, { status: 400 });
  }
}
