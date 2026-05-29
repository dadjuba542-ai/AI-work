import { auth } from "@/auth";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const { action } = await req.json();

  if (!["approve", "reject"].includes(action)) {
    return Response.json({ error: "无效操作" }, { status: 400 });
  }

  const [agent] = db.select().from(agents).where(eq(agents.id, id)).all();
  if (!agent) return Response.json({ error: "Agent 不存在" }, { status: 404 });

  db.update(agents)
    .set({
      reviewStatus: action === "approve" ? "approved" : "rejected",
      isPublished: action === "approve" ? true : agent.isPublished,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.id, id))
    .run();

  return Response.json({ ok: true });
}
