import { auth } from "@/auth";
import { db } from "@/db";
import { userSkills } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { skillId } = await req.json();
  if (!skillId) return Response.json({ error: "缺少 skillId" }, { status: 400 });

  const userId = (session.user as { id: string; role?: string }).id;

  const existing = db
    .select()
    .from(userSkills)
    .where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
    .all();

  if (existing.length > 0) {
    db.delete(userSkills)
      .where(and(eq(userSkills.userId, userId), eq(userSkills.skillId, skillId)))
      .run();
    return Response.json({ favorited: false });
  }

  db.insert(userSkills).values({ userId, skillId, createdAt: new Date().toISOString() }).run();
  return Response.json({ favorited: true });
}
