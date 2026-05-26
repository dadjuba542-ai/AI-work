import { auth } from "@/auth";
import { db } from "@/db";
import { agents, skills, agentSkills } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ChatPageClient } from "./client";

export default async function AgentChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conversation?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const { conversation: convId } = await searchParams;

  const [agent] = db.select().from(agents).where(eq(agents.id, id)).all();
  if (!agent) notFound();

  const examplePrompts: string[] = (() => {
    try {
      return JSON.parse(agent.examplePrompts);
    } catch {
      return [];
    }
  })();

  const linkedSkills = db
    .select()
    .from(agentSkills)
    .where(eq(agentSkills.agentId, id))
    .all();

  const agentSkillNames: string[] = [];
  if (linkedSkills.length > 0) {
    const skillIds = linkedSkills.map((s) => s.skillId);
    const skillData = db
      .select()
      .from(skills)
      .where(inArray(skills.id, skillIds))
      .all();
    for (const sk of skillData) {
      agentSkillNames.push(sk.name);
    }
  }

  return (
    <ChatPageClient
      agentId={agent.id}
      agentName={agent.name}
      agentDescription={agent.description}
      agentIcon={agent.icon}
      examplePrompts={examplePrompts}
      currentUserId={(session.user as any).id}
      initialConversationId={convId}
      agentSkillNames={agentSkillNames}
    />
  );
}
