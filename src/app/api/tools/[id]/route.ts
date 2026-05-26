import { auth } from "@/auth";
import { db } from "@/db";
import { tools } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const [tool] = db.select().from(tools).where(eq(tools.id, id)).all();
  if (!tool) return Response.json({ error: "工具不存在" }, { status: 404 });
  if (tool.isBuiltin) return Response.json({ error: "内置工具不可编辑" }, { status: 400 });

  const body = await req.json();
  db.update(tools)
    .set({
      name: body.name,
      description: body.description,
      parametersSchema: JSON.stringify(body.parametersSchema || {}),
    })
    .where(eq(tools.id, id))
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
  const [tool] = db.select().from(tools).where(eq(tools.id, id)).all();
  if (!tool) return Response.json({ error: "工具不存在" }, { status: 404 });
  if (tool.isBuiltin) return Response.json({ error: "内置工具不可删除" }, { status: 400 });

  db.delete(tools).where(eq(tools.id, id)).run();
  return Response.json({ ok: true });
}
