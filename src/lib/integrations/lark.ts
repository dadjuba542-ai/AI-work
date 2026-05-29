import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const LARK_BASE = "https://open.feishu.cn/open-apis";

function getSetting(key: string): string {
  const [row] = db.select().from(settings).where(eq(settings.key, key)).all();
  return row?.value || "";
}

export function parseLarkDocToken(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (!raw.startsWith("http")) return raw;
  const m = raw.match(/\/(docx|docs)\/([a-zA-Z0-9]+)/);
  return m?.[2] || "";
}

export async function getLarkTenantToken(): Promise<string> {
  const appId = getSetting("lark_app_id") || process.env.LARK_APP_ID || "";
  const appSecret = getSetting("lark_app_secret") || process.env.LARK_APP_SECRET || "";
  if (!appId || !appSecret) throw new Error("未配置飞书 App ID / App Secret");

  const res = await fetch(`${LARK_BASE}/auth/v3/app_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0 || !data.app_access_token) {
    throw new Error(data.msg || `获取飞书 token 失败(${res.status})`);
  }
  return data.app_access_token as string;
}

function stripTagsToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textToCopydeskHtml(text: string): string {
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return safe
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>") || "<br/>"}</p>`)
    .join("");
}

export async function importLarkDocAsHtml(docTokenOrUrl: string): Promise<{ html: string; title?: string }> {
  const docToken = parseLarkDocToken(docTokenOrUrl);
  if (!docToken) throw new Error("无法解析飞书文档 token");
  const token = await getLarkTenantToken();

  // Prefer docx raw content (markdown/text style)
  const res = await fetch(`${LARK_BASE}/docx/v1/documents/${docToken}/raw_content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(data.msg || `读取飞书文档失败(${res.status})`);
  }

  const raw = String(data.data?.content || "").trim();
  if (!raw) throw new Error("飞书文档内容为空");
  const html = textToCopydeskHtml(raw);
  return { html, title: data.data?.title || "" };
}

export async function exportCopydeskToLarkDoc(title: string, html: string): Promise<{ url: string; documentId: string }> {
  const token = await getLarkTenantToken();
  const createRes = await fetch(`${LARK_BASE}/docx/v1/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title: title || "AI Work 文案导出" }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok || created.code !== 0) {
    throw new Error(created.msg || `创建飞书文档失败(${createRes.status})`);
  }

  const documentId = String(created.data?.document?.document_id || "");
  if (!documentId) throw new Error("飞书文档创建成功但未返回 document_id");

  const content = stripTagsToText(html).slice(0, 120000);
  const writeRes = await fetch(`${LARK_BASE}/docx/v1/documents/${documentId}/raw_content`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const written = await writeRes.json().catch(() => ({}));
  if (!writeRes.ok || written.code !== 0) {
    throw new Error(written.msg || `写入飞书文档失败(${writeRes.status})`);
  }

  return {
    documentId,
    url: `https://open.feishu.cn/docx/${documentId}`,
  };
}

export async function sendLarkMessage(params: { receiveId: string; receiveIdType: "chat_id" | "open_id" | "user_id"; text: string }) {
  const token = await getLarkTenantToken();
  const res = await fetch(`${LARK_BASE}/im/v1/messages?receive_id_type=${params.receiveIdType}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receive_id: params.receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: params.text.slice(0, 5000) }),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(data.msg || `飞书消息发送失败(${res.status})`);
  }
  return { messageId: data.data?.message_id || "" };
}

export async function getLarkIntegrationStatus() {
  const appId = getSetting("lark_app_id") || process.env.LARK_APP_ID || "";
  const appSecret = getSetting("lark_app_secret") || process.env.LARK_APP_SECRET || "";
  return {
    configured: Boolean(appId && appSecret),
    appIdConfigured: Boolean(appId),
    appSecretConfigured: Boolean(appSecret),
  };
}
