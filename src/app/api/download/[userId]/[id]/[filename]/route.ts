import { join, resolve, sep } from "path";
import { readFileSync, existsSync } from "fs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const mimeMap: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  md: "text/markdown",
  txt: "text/plain",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string; id: string; filename: string }> }
) {
  const session = await auth();
  if (!session) return new Response("未登录", { status: 401 });

  const { userId, id, filename } = await params;

  if ((session.user as { id: string; role?: string }).id !== userId) {
    return new Response("无权限", { status: 403 });
  }

  const baseDir = resolve(join(process.cwd(), "data", "downloads", userId, id));
  const filepath = resolve(join(baseDir, filename));
  const basePrefix = baseDir.endsWith(sep) ? baseDir : baseDir + sep;
  if (!(filepath === baseDir || filepath.startsWith(basePrefix))) {
    return new Response("非法路径", { status: 400 });
  }

  if (!existsSync(filepath)) return new Response("文件不存在或已过期", { status: 404 });

  const ext = filename.split(".").pop() || "md";
  const contentType = mimeMap[ext] || "application/octet-stream";
  const content = readFileSync(filepath);

  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*="UTF-8''${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
