import { sqlite } from "@/db";

export function ensureWorkspaceDraftsTable() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspace_drafts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_type TEXT NOT NULL,
      agent_id TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_drafts_user_scope
      ON workspace_drafts(user_id, workspace_type, agent_id);
  `);
}
