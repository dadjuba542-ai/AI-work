import { auth } from "@/auth";
import { db } from "@/db";
import { skills, userSkills } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const list = db.select().from(skills).all();
  const userId = (session.user as { id: string; role?: string }).id;

  const myFavs = db.select().from(userSkills).where(eq(userSkills.userId, userId)).all();
  const favSkillIds = new Set(myFavs.map((f) => f.skillId));

  const result = list.map((s) => ({
    ...s,
    favorited: favSkillIds.has(s.id),
  }));

  return Response.json(result);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(skills).values({
    id,
    name: body.name,
    description: body.description,
    systemPrompt: body.systemPrompt,
    toolsAllowed: body.toolsAllowed || "[]",
    displayName: body.displayName || null,
    icon: body.icon || "sparkles",
    category: body.category || "general",
    createdBy: (session.user as { id: string; role?: string }).id,
    createdAt: now,
    updatedAt: now,
  }).run();

  return Response.json({ id }, { status: 201 });
}
