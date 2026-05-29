import { auth } from "@/auth";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");

  const list = db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, (session.user as { id: string; role?: string }).id),
        agentId ? eq(conversations.agentId, agentId) : undefined,
      )
    )
    .orderBy(conversations.updatedAt)
    .all()
    .reverse();

  return Response.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { agentId, title } = await req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(conversations).values({
    id,
    userId: (session.user as { id: string; role?: string }).id,
    agentId,
    title: title || "新对话",
    createdAt: now,
    updatedAt: now,
  }).run();

  return Response.json({ id }, { status: 201 });
}
