import { auth } from "@/auth";
import { sqlite } from "@/db";
import { ensureWorkspaceDraftsTable } from "@/lib/workspace-drafts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  ensureWorkspaceDraftsTable();
  const userId = (session.user as { id: string }).id;
  const url = new URL(req.url);
  const workspaceType = String(url.searchParams.get("workspaceType") || "");
  const agentId = String(url.searchParams.get("agentId") || "");
  if (!workspaceType) return Response.json({ error: "workspaceType 不能为空" }, { status: 400 });

  const row = sqlite
    .prepare(
      `SELECT id, payload_json, updated_at
       FROM workspace_drafts
       WHERE user_id = ? AND workspace_type = ? AND agent_id = ?
       LIMIT 1`
    )
    .get(userId, workspaceType, agentId) as { id: string; payload_json: string; updated_at: string } | undefined;

  if (!row) return Response.json({ draft: null });
  let payload: unknown = null;
  try { payload = JSON.parse(row.payload_json); } catch {}
  return Response.json({ draft: payload, updatedAt: row.updated_at });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  ensureWorkspaceDraftsTable();
  const userId = (session.user as { id: string }).id;
  const body = await req.json().catch(() => ({}));
  const workspaceType = String(body.workspaceType || "");
  const agentId = String(body.agentId || "");
  const draft = body.draft ?? null;
  if (!workspaceType) return Response.json({ error: "workspaceType 不能为空" }, { status: 400 });
  if (draft === null) return Response.json({ error: "draft 不能为空" }, { status: 400 });

  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO workspace_drafts (id, user_id, workspace_type, agent_id, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, workspace_type, agent_id)
       DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`
    )
    .run(crypto.randomUUID(), userId, workspaceType, agentId, JSON.stringify(draft), now, now);

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  ensureWorkspaceDraftsTable();
  const userId = (session.user as { id: string }).id;
  const url = new URL(req.url);
  const workspaceType = String(url.searchParams.get("workspaceType") || "");
  const agentId = String(url.searchParams.get("agentId") || "");
  if (!workspaceType) return Response.json({ error: "workspaceType 不能为空" }, { status: 400 });

  sqlite
    .prepare("DELETE FROM workspace_drafts WHERE user_id = ? AND workspace_type = ? AND agent_id = ?")
    .run(userId, workspaceType, agentId);

  return Response.json({ ok: true });
}
