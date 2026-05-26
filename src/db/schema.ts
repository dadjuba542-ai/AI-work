import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
});

export const apiProviders = sqliteTable("api_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().default(""),
  baseUrl: text("base_url").notNull(),
  defaultModel: text("default_model").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tools = sqliteTable("tools", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  parametersSchema: text("parameters_schema").notNull(),
  isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  toolsAllowed: text("tools_allowed").notNull().default("[]"),
  icon: text("icon").notNull().default("sparkles"),
  category: text("category").notNull().default("general"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentSkills = sqliteTable("agent_skills", {
  agentId: text("agent_id").notNull(),
  skillId: text("skill_id").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("bot"),
  category: text("category").notNull().default("general"),
  systemPrompt: text("system_prompt").notNull(),
  examplePrompts: text("example_prompts").notNull().default("[]"),
  model: text("model").notNull().default("MiniMax-M2.7"),
  temperature: text("temperature").notNull().default("0.7"),
  isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
  providerId: text("provider_id"),
  maxIterations: integer("max_iterations").notNull().default(5),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentId: text("agent_id").notNull(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolExecutions: text("tool_executions"),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
