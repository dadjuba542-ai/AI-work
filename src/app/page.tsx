import { auth } from "@/auth";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AgentMarketplace } from "./marketplace";

export default async function HomePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const agentList = db.select().from(agents).where(eq(agents.isPublished, true)).all();

  return <AgentMarketplace agents={agentList} />;
}
