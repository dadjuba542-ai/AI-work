import { auth } from "@/auth";
import { db } from "@/db";
import { agents, users } from "@/db/schema";
import { eq, or } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const userId = (session.user as { id: string; role?: string }).id;
  const role = (session.user as { id: string; role?: string }).role;

  let list: Array<typeof agents.$inferSelect>;
  if (role === "admin") {
    list = db.select().from(agents).all();
  } else {
    list = db
      .select()
      .from(agents)
      .where(or(eq(agents.reviewStatus, "approved"), eq(agents.createdBy, userId)))
      .all();
  }

  const adminUserIds = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .all()
    .map((u) => u.id);

  const result = list.map((a) => ({
    ...a,
    examplePrompts: JSON.parse(a.examplePrompts || "[]"),
    isOfficial: !!a.createdBy && adminUserIds.includes(a.createdBy),
  }));

  return Response.json(result);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const body = await req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = (session.user as { id: string; role?: string }).id;

  db.insert(agents).values({
    id,
    name: body.name,
    description: body.description,
    icon: body.icon || "bot",
    category: body.category || "general",
    systemPrompt: body.systemPrompt,
    examplePrompts: JSON.stringify(body.examplePrompts || []),
    model: body.model || "MiniMax-M2.7",
    temperature: body.temperature || "0.7",
    maxIterations: body.maxIterations || 5,
    isPublished: false,
    reviewStatus: body.reviewStatus || "none",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  }).run();

  return Response.json({ id }, { status: 201 });
}
