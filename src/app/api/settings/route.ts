import { auth } from "@/auth";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const rows = db.select().from(settings).all();
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return Response.json(map);
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json();

  for (const [key, value] of Object.entries(body)) {
    const existing = db.select().from(settings).where(eq(settings.key, key)).all();
    if (existing.length > 0) {
      db.update(settings).set({ value: value as string }).where(eq(settings.key, key)).run();
    } else {
      db.insert(settings).values({ key, value: value as string }).run();
    }
  }

  return Response.json({ ok: true });
}
