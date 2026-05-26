import { auth } from "@/auth";
import { db } from "@/db";
import { skills, agentSkills } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rmSync } from "fs";
import { join, resolve } from "path";

const SKILLS_DIR = resolve(join(process.cwd(), "data", "skills"));

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  db.update(skills)
    .set({
      name: body.name,
      description: body.description,
      systemPrompt: body.systemPrompt,
      toolsAllowed: body.toolsAllowed,
      icon: body.icon,
      category: body.category,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(skills.id, id))
    .run();

  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;

  db.delete(agentSkills).where(eq(agentSkills.skillId, id)).run();
  db.delete(skills).where(eq(skills.id, id)).run();

  try {
    rmSync(join(SKILLS_DIR, id), { recursive: true, force: true });
  } catch {}

  return Response.json({ ok: true });
}
