import { auth } from "@/auth";
import { db } from "@/db";
import { apiProviders } from "@/db/schema";
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
  const body = await req.json();

  db.update(apiProviders)
    .set({
      name: body.name,
      apiKey: body.apiKey || undefined,
      baseUrl: body.baseUrl,
      defaultModel: body.defaultModel,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(apiProviders.id, id))
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
  db.delete(apiProviders).where(eq(apiProviders.id, id)).run();

  return Response.json({ ok: true });
}
