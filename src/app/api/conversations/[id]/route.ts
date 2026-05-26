import { auth } from "@/auth";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;

  const [conv] = db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, (session.user as any).id)))
    .all();

  if (!conv) return Response.json({ error: "对话不存在" }, { status: 404 });

  const msgs = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt)
    .all();

  return Response.json({ conversation: conv, messages: msgs });
}
