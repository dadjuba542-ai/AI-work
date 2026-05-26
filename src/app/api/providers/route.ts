import { auth } from "@/auth";
import { db } from "@/db";
import { apiProviders } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const list = db.select().from(apiProviders).all();
  return Response.json(list.map(({ apiKey, ...rest }) => rest));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as any).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.insert(apiProviders).values({
    id,
    name: body.name,
    apiKey: body.apiKey || "",
    baseUrl: body.baseUrl,
    createdAt: now,
    updatedAt: now,
  }).run();

  return Response.json({ id }, { status: 201 });
}
