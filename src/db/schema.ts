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
  displayName: text("display_name"),
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

export const userSkills = sqliteTable("user_skills", {
  userId: text("user_id").notNull(),
  skillId: text("skill_id").notNull(),
  createdAt: text("created_at").notNull(),
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
  reviewStatus: text("review_status").notNull().default("none"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  agentId: text("agent_id"),
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

export const kbDocuments = sqliteTable("kb_documents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: text("product_id").notNull().default("general"),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(),
  status: text("status").notNull().default("uploaded"),
  version: text("version").notNull().default("v1"),
  sensitivity: text("sensitivity").notNull().default("internal"),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  fileHash: text("file_hash").notNull().default(""),
  contentHash: text("content_hash").notNull().default(""),
  parser: text("parser").notNull().default("native"),
  parseError: text("parse_error"),
  indexedAt: text("indexed_at"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const kbChunks = sqliteTable("kb_chunks", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  productId: text("product_id").notNull().default("general"),
  documentId: text("document_id").notNull(),
  documentVersion: text("document_version").notNull().default("v1"),
  chunkIndex: integer("chunk_index").notNull().default(0),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull().default(""),
  tokenCount: integer("token_count").notNull().default(0),
  pageStart: integer("page_start").notNull().default(0),
  pageEnd: integer("page_end").notNull().default(0),
  headingPath: text("heading_path").notNull().default(""),
  charStart: integer("char_start").notNull().default(0),
  charEnd: integer("char_end").notNull().default(0),
  metaJson: text("meta_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
});

export const kbIndexJobs = sqliteTable("kb_index_jobs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  documentId: text("document_id").notNull(),
  jobType: text("job_type").notNull().default("index"),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const kbQueryLogs = sqliteTable("kb_query_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  productId: text("product_id").notNull().default("general"),
  ragMode: text("rag_mode").notNull().default("off"),
  query: text("query").notNull(),
  rewrittenQuery: text("rewritten_query").notNull().default(""),
  filtersJson: text("filters_json").notNull().default("{}"),
  topkChunkIds: text("topk_chunk_ids").notNull().default("[]"),
  retrievalStrategy: text("retrieval_strategy").notNull().default("fts5-bm25"),
  latencySearchMs: integer("latency_search_ms").notNull().default(0),
  latencyTotalMs: integer("latency_total_ms").notNull().default(0),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const kbAnswerLogs = sqliteTable("kb_answer_logs", {
  id: text("id").primaryKey(),
  queryLogId: text("query_log_id"),
  tenantId: text("tenant_id").notNull(),
  userId: text("user_id").notNull(),
  ragMode: text("rag_mode").notNull().default("off"),
  answer: text("answer").notNull().default(""),
  sourceChunkIds: text("source_chunk_ids").notNull().default("[]"),
  citationsJson: text("citations_json").notNull().default("[]"),
  hasCitations: integer("has_citations", { mode: "boolean" }).notNull().default(false),
  isGrounded: integer("is_grounded", { mode: "boolean" }).notNull().default(false),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
});

export const workspaceDrafts = sqliteTable("workspace_drafts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  workspaceType: text("workspace_type").notNull(),
  agentId: text("agent_id").notNull().default(""),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
