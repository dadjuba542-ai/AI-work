import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const list = db.select().from(users).all();
  return Response.json(
    list.map((user) => {
      const { passwordHash, ...rest } = user;
      void passwordHash;
      return rest;
    })
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { email, name, password, role } = await req.json();

  const [existing] = db.select().from(users).where(eq(users.email, email)).all();
  if (existing) {
    return Response.json({ error: "邮箱已存在" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash,
    role: role || "user",
    createdAt: new Date().toISOString(),
  }).run();

  return Response.json({ ok: true }, { status: 201 });
}
