import { auth } from "@/auth";
import { db } from "@/db";
import { agentSkills } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const { skillIds } = await req.json();

  db.delete(agentSkills).where(eq(agentSkills.agentId, id)).run();
  for (const skillId of skillIds) {
    db.insert(agentSkills).values({ agentId: id, skillId }).run();
  }

  return Response.json({ ok: true });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const list = db.select().from(agentSkills).where(eq(agentSkills.agentId, id)).all();
  return Response.json(list.map((a) => a.skillId));
}
