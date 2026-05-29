import { auth } from "@/auth";
import { db } from "@/db";
import { tools } from "@/db/schema";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const list = db.select().from(tools).all();
  return Response.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();
  const id = crypto.randomUUID();

  db.insert(tools).values({
    id,
    name: body.name,
    description: body.description,
    parametersSchema: JSON.stringify(body.parametersSchema || {}),
    isBuiltin: false,
    createdAt: new Date().toISOString(),
  }).run();

  return Response.json({ id }, { status: 201 });
}
