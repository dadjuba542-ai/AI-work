import { auth } from "@/auth";
import { db } from "@/db";
import { agents, settings, users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UniversalChat } from "../universal-chat";

export default async function SheetdeskPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { agent } = await searchParams;
  const userId = (session.user as { id: string }).id;

  const agentList = db
    .select()
    .from(agents)
    .where(or(eq(agents.reviewStatus, "approved"), eq(agents.createdBy, userId)))
    .all();

  const [modelSetting] = db.select().from(settings).where(eq(settings.key, "llm_available_models")).all();
  const models = (modelSetting?.value || "MiniMax-M2.7").split(",").map((m) => m.trim());

  const adminIds = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .all()
    .map((u) => u.id);

  return (
    <UniversalChat
      agents={agentList.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        examplePrompts: JSON.parse(a.examplePrompts || "[]"),
        createdBy: a.createdBy || "",
        reviewStatus: a.reviewStatus,
        isOfficial: !a.createdBy || adminIds.includes(a.createdBy),
      }))}
      models={models}
      initialAgentId={agent}
      initialViewMode="sheetdesk"
    />
  );
}

