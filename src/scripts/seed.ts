import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";
import { join } from "path";
import * as schema from "../db/schema";
import { users, agents, settings, apiProviders } from "../db/schema";

async function seed() {
  const sqlite = new Database("data/sqlite.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  const adminId = crypto.randomUUID();
  const adminHash = await bcrypt.hash("admin123", 10);

  const existingAdmin = db
    .select()
    .from(users)
    .where(eq(users.email, "admin@agent.local"))
    .all();

  if (existingAdmin.length === 0) {
    db.insert(users).values({
      id: adminId,
      email: "admin@agent.local",
      name: "管理员",
      passwordHash: adminHash,
      role: "admin",
      createdAt: new Date().toISOString(),
    }).run();
    console.log("Created admin user: admin@agent.local / admin123");
  }

  const existingProviders = db.select().from(apiProviders).all();
  if (existingProviders.length === 0) {
    const now = new Date().toISOString();
    db.insert(apiProviders).values({
      id: crypto.randomUUID(),
      name: "MiniMax",
      apiKey: "",
      baseUrl: "https://api.minimaxi.com/v1",
      defaultModel: "MiniMax-M2.7",
      createdAt: now,
      updatedAt: now,
    }).run();
    console.log("Created default API provider: MiniMax");
  }

  const existingSettings = db
    .select()
    .from(settings)
    .where(eq(settings.key, "llm_api_key"))
    .all();

  if (existingSettings.length === 0) {
    db.insert(settings).values({
      key: "llm_api_key",
      value: "",
    }).run();
    db.insert(settings).values({
      key: "llm_base_url",
      value: "https://api.minimaxi.com",
    }).run();
    db.insert(settings).values({
      key: "llm_default_model",
      value: "MiniMax-M2.7",
    }).run();
    console.log("Created default settings");
  }

  // Import agents from prompts collection if none exist
  const agentCount = db.select().from(agents).all().length;
  if (agentCount === 0) {
    console.log("No agents found, importing from prompts collection...");
    try {
      const result = execSync("python3 src/scripts/import-prompts.py", {
        cwd: join(__dirname, ".."),
        timeout: 120000,
        encoding: "utf-8",
      });
      console.log(result);
    } catch (err: any) {
      console.error("Failed to import agents:", err.message);
    }
  }

  sqlite.close();
  console.log("Seed completed!");
}

seed().catch(console.error);

