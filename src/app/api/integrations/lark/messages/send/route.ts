import { auth } from "@/auth";
import { sendLarkMessage } from "@/lib/integrations/lark";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const receiveId = String(body.receiveId || "").trim();
  const receiveIdType = String(body.receiveIdType || "chat_id") as "chat_id" | "open_id" | "user_id";
  const text = String(body.text || "").trim();
  if (!receiveId || !text) return Response.json({ error: "receiveId 与 text 不能为空" }, { status: 400 });

  try {
    const data = await sendLarkMessage({ receiveId, receiveIdType, text });
    return Response.json(data);
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "发送失败" }, { status: 400 });
  }
}
