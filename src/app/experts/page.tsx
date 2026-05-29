import { auth } from "@/auth";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ExpertGrid } from "./expert-grid";

export default async function ExpertsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const agentList = db.select().from(agents).where(eq(agents.isPublished, true)).all();

  return <ExpertGrid agents={agentList.map((a) => ({ id: a.id, name: a.name, description: a.description, icon: a.icon, category: a.category }))} />;
}
