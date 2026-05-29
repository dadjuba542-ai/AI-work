import { auth } from "@/auth";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const [agent] = db.select().from(agents).where(eq(agents.id, id)).all();
  if (!agent) return Response.json({ error: "Agent 不存在" }, { status: 404 });

  const userId = (session.user as { id: string; role?: string }).id;
  if (agent.createdBy !== userId) {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  if (agent.reviewStatus === "pending") {
    return Response.json({ error: "已在审核中" }, { status: 400 });
  }

  db.update(agents)
    .set({ reviewStatus: "pending", updatedAt: new Date().toISOString() })
    .where(eq(agents.id, id))
    .run();

  return Response.json({ ok: true });
}
