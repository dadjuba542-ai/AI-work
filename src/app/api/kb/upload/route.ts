import { auth } from "@/auth";
import { db } from "@/db";
import { kbDocuments } from "@/db/schema";
import { ensureRagTables, hashText } from "@/lib/rag";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  ensureRagTables();
  const tenantId = (session.user as { id: string }).id;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const productId = String(form.get("productId") || "general");
  const sensitivity = String(form.get("sensitivity") || "internal");
  const version = String(form.get("version") || "v1");

  if (!file) return Response.json({ error: "缺少文件" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHash = hashText(bytes.toString("base64"));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const safeName = `${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dir = join(process.cwd(), "data", "kb", tenantId);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, safeName);
  writeFileSync(filePath, bytes);

  db.insert(kbDocuments).values({
    id,
    tenantId,
    productId,
    title: file.name,
    sourceType: file.name.split(".").pop()?.toLowerCase() || "file",
    status: "uploaded",
    version,
    sensitivity,
    originalFilename: file.name,
    mimeType: file.type || "application/octet-stream",
    filePath,
    fileSize: bytes.length,
    fileHash,
    contentHash: "",
    createdBy: tenantId,
    createdAt: now,
    updatedAt: now,
  }).run();

  return Response.json({ documentId: id, fileName: file.name }, { status: 201 });
}
