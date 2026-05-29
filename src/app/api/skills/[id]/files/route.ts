import { auth } from "@/auth";
import { db } from "@/db";
import { skills } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";

const SKILLS_DIR = resolve(join(process.cwd(), "data", "skills"));

function buildFileTree(dirPath: string, depth = 0): string[] {
  if (depth > 8) return ["(max depth reached)"];
  const items = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  for (const item of items) {
    const fullPath = join(dirPath, item.name);
    if (item.isDirectory()) {
      lines.push(`📁 ${item.name}/`);
      const sub = buildFileTree(fullPath, depth + 1).map((l) => `  ${l}`);
      lines.push(...sub);
    } else {
      const size = statSync(fullPath).size;
      lines.push(`📄 ${item.name} (${size} bytes)`);
    }
  }
  return lines;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { id } = await params;
  const [skill] = db.select().from(skills).where(eq(skills.id, id)).all();
  if (!skill) return Response.json({ error: "技能不存在" }, { status: 404 });

  const dir = join(SKILLS_DIR, id);
  if (!existsSync(dir)) {
    return Response.json({ skillId: id, name: skill.name, tree: "(no files on disk)" });
  }

  const lines = buildFileTree(dir);
  return Response.json({
    skillId: id,
    name: skill.name,
    tree: lines.length > 0 ? lines.join("\n") : "(empty directory)",
  });
}

