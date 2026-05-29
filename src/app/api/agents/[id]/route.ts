import { auth } from "@/auth";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const [agent] = db.select().from(agents).where(eq(agents.id, id)).all();
  if (!agent) return Response.json({ error: "Agent 不存在" }, { status: 404 });

  return Response.json(agent);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const [agent] = db.select().from(agents).where(eq(agents.id, id)).all();
  if (!agent) return Response.json({ error: "Agent 不存在" }, { status: 404 });

  const userId = (session.user as { id: string; role?: string }).id;
  const role = (session.user as { id: string; role?: string }).role;
  if (role !== "admin" && agent.createdBy !== userId) {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();

  const updates: Record<string, unknown> = {
    name: body.name,
    description: body.description,
    icon: body.icon,
    category: body.category,
    systemPrompt: body.systemPrompt,
    examplePrompts: JSON.stringify(body.examplePrompts || []),
    model: body.model,
    temperature: body.temperature,
    maxIterations: body.maxIterations,
    isPublished: body.isPublished,
    updatedAt: new Date().toISOString(),
  };

  if (role === "admin") {
    updates.providerId = body.providerId || null;
    updates.reviewStatus = body.reviewStatus;
  }

  db.update(agents).set(updates).where(eq(agents.id, id)).run();

  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const [agent] = db.select().from(agents).where(eq(agents.id, id)).all();
  if (!agent) return Response.json({ error: "Agent 不存在" }, { status: 404 });

  const userId = (session.user as { id: string; role?: string }).id;
  const role = (session.user as { id: string; role?: string }).role;
  if (role !== "admin" && agent.createdBy !== userId) {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  db.delete(agents).where(eq(agents.id, id)).run();

  return Response.json({ ok: true });
}
