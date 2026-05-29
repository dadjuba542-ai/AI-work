import { createHash } from "crypto";
import { readFileSync } from "fs";
import { db, sqlite } from "@/db";
import { kbAnswerLogs, kbDocuments, kbIndexJobs, kbQueryLogs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { parseOfficeFile } from "@/lib/parse-office";

export type RagMode = "off" | "summary" | "full";

export interface RagChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentVersion: string;
  content: string;
  score: number;
  pageStart: number;
  pageEnd: number;
  headingPath: string;
}

export function ensureRagTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS kb_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL DEFAULT 'general',
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      version TEXT NOT NULL DEFAULT 'v1',
      sensitivity TEXT NOT NULL DEFAULT 'internal',
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_hash TEXT NOT NULL DEFAULT '',
      content_hash TEXT NOT NULL DEFAULT '',
      parser TEXT NOT NULL DEFAULT 'native',
      parse_error TEXT,
      indexed_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL DEFAULT 'general',
      document_id TEXT NOT NULL,
      document_version TEXT NOT NULL DEFAULT 'v1',
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      token_count INTEGER NOT NULL DEFAULT 0,
      page_start INTEGER NOT NULL DEFAULT 0,
      page_end INTEGER NOT NULL DEFAULT 0,
      heading_path TEXT NOT NULL DEFAULT '',
      char_start INTEGER NOT NULL DEFAULT 0,
      char_end INTEGER NOT NULL DEFAULT 0,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_index_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      job_type TEXT NOT NULL DEFAULT 'index',
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_query_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      product_id TEXT NOT NULL DEFAULT 'general',
      rag_mode TEXT NOT NULL DEFAULT 'off',
      query TEXT NOT NULL,
      rewritten_query TEXT NOT NULL DEFAULT '',
      filters_json TEXT NOT NULL DEFAULT '{}',
      topk_chunk_ids TEXT NOT NULL DEFAULT '[]',
      retrieval_strategy TEXT NOT NULL DEFAULT 'fts5-bm25',
      latency_search_ms INTEGER NOT NULL DEFAULT 0,
      latency_total_ms INTEGER NOT NULL DEFAULT 0,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_answer_logs (
      id TEXT PRIMARY KEY,
      query_log_id TEXT,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rag_mode TEXT NOT NULL DEFAULT 'off',
      answer TEXT NOT NULL DEFAULT '',
      source_chunk_ids TEXT NOT NULL DEFAULT '[]',
      citations_json TEXT NOT NULL DEFAULT '[]',
      has_citations INTEGER NOT NULL DEFAULT 0,
      is_grounded INTEGER NOT NULL DEFAULT 0,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      document_id UNINDEXED,
      tenant_id UNINDEXED,
      product_id UNINDEXED,
      sensitivity UNINDEXED,
      title,
      document_title,
      content,
      tokenize='trigram'
    );
    CREATE INDEX IF NOT EXISTS idx_kb_documents_tenant_product ON kb_documents(tenant_id, product_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(document_id, chunk_index);
    CREATE INDEX IF NOT EXISTS idx_kb_jobs_tenant_doc ON kb_index_jobs(tenant_id, document_id);
  `);
}

export function chunkText(text: string, size = 900, overlap = 120): Array<{ content: string; charStart: number; charEnd: number; headingPath: string }> {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  const out: Array<{ content: string; charStart: number; charEnd: number; headingPath: string }> = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + size, cleaned.length);
    if (end < cleaned.length) {
      const splitByPara = cleaned.lastIndexOf("\n\n", end);
      const splitByLine = cleaned.lastIndexOf("\n", end);
      const splitByPunc = Math.max(cleaned.lastIndexOf("。", end), cleaned.lastIndexOf("！", end), cleaned.lastIndexOf("？", end));
      const candidate = Math.max(splitByPara, splitByLine, splitByPunc);
      if (candidate > start + Math.floor(size * 0.45)) end = candidate + 1;
    }
    const content = cleaned.slice(start, end).trim();
    if (content) out.push({ content, charStart: start, charEnd: end, headingPath: "" });
    if (end >= cleaned.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

export function hashText(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function extractTextFromDocument(filePath: string, filename: string, mimeType: string): Promise<string> {
  const buf = readFileSync(filePath);
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || mimeType.startsWith("text/")) {
    return buf.toString("utf-8");
  }
  return parseOfficeFile(buf, filename);
}

export async function runIndexJob(jobId: string) {
  ensureRagTables();
  const [job] = db.select().from(kbIndexJobs).where(eq(kbIndexJobs.id, jobId)).all();
  if (!job) return;
  const [doc] = db
    .select()
    .from(kbDocuments)
    .where(and(eq(kbDocuments.id, job.documentId), eq(kbDocuments.tenantId, job.tenantId)))
    .all();
  if (!doc) {
    db.update(kbIndexJobs).set({ status: "failed", errorMessage: "document_not_found", finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(kbIndexJobs.id, jobId)).run();
    return;
  }

  db.update(kbIndexJobs).set({ status: "running", progress: 5, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(kbIndexJobs.id, jobId)).run();
  db.update(kbDocuments).set({ status: "parsing", updatedAt: new Date().toISOString() }).where(eq(kbDocuments.id, doc.id)).run();

  try {
    const rawText = await extractTextFromDocument(doc.filePath, doc.originalFilename, doc.mimeType);
    const text = rawText.trim();
    if (!text) throw new Error("文档无可用文本");

    db.update(kbIndexJobs).set({ progress: 35, updatedAt: new Date().toISOString() }).where(eq(kbIndexJobs.id, jobId)).run();
    const chunks = chunkText(text);

    sqlite.prepare("DELETE FROM kb_chunks_fts WHERE document_id = ?").run(doc.id);
    sqlite.prepare("DELETE FROM kb_chunks WHERE document_id = ?").run(doc.id);

    const now = new Date().toISOString();
    const insertChunk = sqlite.prepare(`
      INSERT INTO kb_chunks (id, tenant_id, product_id, document_id, document_version, chunk_index, content, content_hash, token_count, page_start, page_end, heading_path, char_start, char_end, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = sqlite.prepare(`
      INSERT INTO kb_chunks_fts (chunk_id, document_id, tenant_id, product_id, sensitivity, title, document_title, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = sqlite.transaction(() => {
      chunks.forEach((chunk, idx) => {
        const id = crypto.randomUUID();
        const hash = hashText(chunk.content);
        insertChunk.run(
          id,
          doc.tenantId,
          doc.productId,
          doc.id,
          doc.version,
          idx,
          chunk.content,
          hash,
          Math.ceil(chunk.content.length / 4),
          0,
          0,
          chunk.headingPath,
          chunk.charStart,
          chunk.charEnd,
          "{}",
          now,
        );
        insertFts.run(id, doc.id, doc.tenantId, doc.productId, doc.sensitivity, doc.title, doc.title, chunk.content);
      });
    });
    txn();

    db.update(kbDocuments).set({ status: "indexed", contentHash: hashText(text), indexedAt: now, parseError: null, updatedAt: now }).where(eq(kbDocuments.id, doc.id)).run();
    db.update(kbIndexJobs).set({ status: "success", progress: 100, finishedAt: now, updatedAt: now }).where(eq(kbIndexJobs.id, jobId)).run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    db.update(kbDocuments).set({ status: "failed", parseError: message, updatedAt: now }).where(eq(kbDocuments.id, doc.id)).run();
    db.update(kbIndexJobs).set({ status: "failed", errorMessage: message, finishedAt: now, updatedAt: now }).where(eq(kbIndexJobs.id, jobId)).run();
  }
}

export function searchRagChunks(params: {
  tenantId: string;
  productId: string;
  query: string;
  sensitivityList?: string[];
  topK?: number;
}): RagChunk[] {
  ensureRagTables();
  const { tenantId, productId, query } = params;
  const topK = params.topK ?? 8;
  const sensitivityList = params.sensitivityList && params.sensitivityList.length > 0 ? params.sensitivityList : ["public", "internal"];

  const marks = sensitivityList.map(() => "?").join(",");
  const stmt = sqlite.prepare(`
    SELECT
      c.id as chunk_id,
      c.document_id,
      d.title as document_title,
      d.version as document_version,
      c.content,
      c.page_start,
      c.page_end,
      c.heading_path,
      bm25(kb_chunks_fts) as score
    FROM kb_chunks_fts
    JOIN kb_chunks c ON c.id = kb_chunks_fts.chunk_id AND c.deleted_at IS NULL
    JOIN kb_documents d ON d.id = c.document_id AND d.deleted_at IS NULL
    WHERE kb_chunks_fts MATCH ?
      AND kb_chunks_fts.tenant_id = ?
      AND kb_chunks_fts.product_id = ?
      AND d.status = 'indexed'
      AND d.sensitivity IN (${marks})
    ORDER BY score
    LIMIT ?
  `);

  const rows = stmt.all(query.trim(), tenantId, productId, ...sensitivityList, topK) as Array<{
    chunk_id: string;
    document_id: string;
    document_title: string;
    document_version: string;
    content: string;
    page_start: number;
    page_end: number;
    heading_path: string;
    score: number;
  }>;

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    documentTitle: r.document_title,
    documentVersion: r.document_version,
    content: r.content,
    score: r.score,
    pageStart: r.page_start || 0,
    pageEnd: r.page_end || 0,
    headingPath: r.heading_path || "",
  }));
}

export function buildRagContext(mode: RagMode, chunks: RagChunk[]): string {
  if (mode === "off" || chunks.length === 0) return "";
  if (mode === "summary") {
    const summary = chunks
      .map((c, i) => `(${i + 1}) [${c.documentTitle} ${c.documentVersion}] ${c.content.slice(0, 220).replace(/\n/g, " ")}`)
      .join("\n");
    return `以下为知识库命中摘要，仅可用于事实依据：\n${summary}`;
  }
  const full = chunks
    .map((c, i) => `### 引用${i + 1}\n来源：${c.documentTitle} ${c.documentVersion} | chunk:${c.chunkId}\n内容：\n${c.content}`)
    .join("\n\n");
  return `以下为知识库原文片段，产品事实必须以此为准：\n\n${full}`;
}

export function logRagQuery(params: {
  tenantId: string;
  userId: string;
  conversationId?: string;
  productId: string;
  ragMode: RagMode;
  query: string;
  rewrittenQuery: string;
  chunks: RagChunk[];
  latencySearchMs: number;
  latencyTotalMs: number;
}): string {
  const id = crypto.randomUUID();
  db.insert(kbQueryLogs).values({
    id,
    tenantId: params.tenantId,
    userId: params.userId,
    conversationId: params.conversationId || null,
    productId: params.productId,
    ragMode: params.ragMode,
    query: params.query,
    rewrittenQuery: params.rewrittenQuery,
    topkChunkIds: JSON.stringify(params.chunks.map((x) => x.chunkId)),
    hitCount: params.chunks.length,
    latencySearchMs: params.latencySearchMs,
    latencyTotalMs: params.latencyTotalMs,
    createdAt: new Date().toISOString(),
  }).run();
  return id;
}

export function logRagAnswer(params: {
  queryLogId?: string;
  tenantId: string;
  userId: string;
  ragMode: RagMode;
  answer: string;
  chunks: RagChunk[];
  errorMessage?: string;
}) {
  db.insert(kbAnswerLogs).values({
    id: crypto.randomUUID(),
    queryLogId: params.queryLogId || null,
    tenantId: params.tenantId,
    userId: params.userId,
    ragMode: params.ragMode,
    answer: params.answer,
    sourceChunkIds: JSON.stringify(params.chunks.map((x) => x.chunkId)),
    citationsJson: JSON.stringify(params.chunks.map((x) => ({ chunkId: x.chunkId, title: x.documentTitle, version: x.documentVersion }))),
    hasCitations: params.chunks.length > 0,
    isGrounded: params.chunks.length > 0 && !params.errorMessage,
    errorMessage: params.errorMessage || null,
    createdAt: new Date().toISOString(),
  }).run();
}
