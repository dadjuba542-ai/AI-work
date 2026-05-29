import { auth } from "@/auth";
import { db } from "@/db";
import { skills } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseSkillMd } from "@/lib/skill-parser";
import AdmZip from "adm-zip";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve, dirname, posix as pathPosix } from "path";

const SKILLS_DIR = resolve(join(process.cwd(), "data", "skills"));

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
      return Response.json({ error: "无权限" }, { status: 403 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    if (body.type === "base64") return handleBase64(body, (session.user as { id: string; role?: string }).id);
    if (body.type === "github") {
      const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl : "";
      return handleGitHub(repoUrl, (session.user as { id: string; role?: string }).id);
    }
    if (body.type === "content") return handleContent(body, (session.user as { id: string; role?: string }).id);
    if (body.type === "local") {
      const name = typeof body.name === "string" ? body.name : "";
      return handleLocal(name, (session.user as { id: string; role?: string }).id);
    }

    return Response.json({ error: "不支持的导入方式" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ imported: 0, errors: [`服务器错误: ${message}`] });
  }
}

type ParsedEntry = {
  sourcePath: string;
  parsed: NonNullable<ReturnType<typeof parseSkillMd>>;
};

function parseMdEntries(entries: { name: string; content: string }[]): ParsedEntry[] {
  const result: ParsedEntry[] = [];
  for (const entry of entries) {
    const p = parseSkillMd(entry.content);
    if (p) result.push({ sourcePath: entry.name, parsed: p });
  }
  return result;
}

function sanitizeZipPath(input: string): string | null {
  const normalized = pathPosix.normalize(input.replace(/\\/g, "/"));
  if (normalized.startsWith("/") || normalized.startsWith("../") || normalized.includes("/../")) return null;
  return normalized;
}

function saveSkillFiles(skillId: string, files: { name: string; content: Buffer }[]) {
  const dir = join(SKILLS_DIR, skillId);
  for (const f of files) {
    const rel = sanitizeZipPath(f.name);
    if (!rel) continue;
    const fp = join(dir, rel);
    mkdirSync(dirname(fp), { recursive: true });
    writeFileSync(fp, f.content);
  }
}

function importSkills(
  parsed: ParsedEntry[],
  userId: string,
  zipEntries?: { name: string; content: Buffer }[],
  zipRootDirs?: Record<string, string>
): { imported: number; errors: string[]; skillIds: string[] } {
  let imported = 0;
  const errors: string[] = [];
  const skillIds: string[] = [];
  const now = new Date().toISOString();

  for (const item of parsed) {
    const skill = item.parsed;
    const existing = db.select().from(skills).where(eq(skills.name, skill.name)).all();
    if (existing.length > 0) {
      errors.push(`已存在同名技能「${skill.name}」，跳过`);
      continue;
    }

    const id = crypto.randomUUID();
    db.insert(skills).values({
      id,
      name: skill.name,
      description: skill.description,
      systemPrompt: skill.systemPrompt,
      toolsAllowed: JSON.stringify(skill.toolsAllowed),
      displayName: skill.displayName || null,
      icon: skill.icon,
      category: skill.category,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }).run();

    if (zipEntries && zipRootDirs) {
      const root = zipRootDirs[item.sourcePath] || "";
      const filtered = zipEntries
        .filter((e) => {
          const p = sanitizeZipPath(e.name);
          if (!p) return false;
          if (root && !(p === root || p.startsWith(`${root}/`))) return false;
          const basename = p.split("/").pop()?.toLowerCase() || "";
          return basename !== "skill.md";
        })
        .map((e) => {
          const p = sanitizeZipPath(e.name)!;
          const rel = root && p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p;
          return { name: rel, content: e.content };
        });
      saveSkillFiles(id, filtered);
    }

    skillIds.push(id);
    imported++;
  }

  return { imported, errors, skillIds };
}

function handleBase64(body: Record<string, unknown>, userId: string): Response {
  const data = typeof body.data === "string" ? body.data : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  if (!data) return Response.json({ error: "缺少文件数据" }, { status: 400 });

  let buf: Buffer;
  try { buf = Buffer.from(data, "base64"); }
  catch { return Response.json({ error: "Base64 解析失败" }, { status: 400 }); }

  if (filename?.toLowerCase().endsWith(".zip")) {
    try {
      const zip = new AdmZip(buf);
      const entries = zip.getEntries();
      const mdEntries: { name: string; content: string }[] = [];
      const allFiles: { name: string; content: Buffer }[] = [];

      for (const ze of entries) {
        if (ze.isDirectory) continue;
        // adm-zip 使用 entryName（统一用正斜杠）而不是 name（可能含反斜杠）
        const entryName = sanitizeZipPath(ze.entryName);
        if (!entryName) continue;
        // 跳过 macOS 的 __MACOSX 目录
        if (entryName.startsWith("__MACOSX/")) continue;
        
        const content = ze.getData();
        allFiles.push({ name: entryName, content });
        if (entryName.toLowerCase().endsWith(".md")) {
          mdEntries.push({ name: entryName, content: content.toString("utf-8") });
        }
      }

      if (mdEntries.length === 0) {
        return Response.json({ 
          imported: 0, 
          errors: [`${filename} 中未找到 .md 文件，请确认压缩包内包含 SKILL.md 或类似文件`] 
        }, { status: 200 });
      }

      const parsed = parseMdEntries(mdEntries);
      if (parsed.length === 0) {
        return Response.json({ 
          imported: 0, 
          errors: [`${filename} 中的 .md 文件未找到有效的技能定义（需要 YAML frontmatter）`] 
        }, { status: 200 });
      }
      
      const roots: Record<string, string> = {};
      for (const md of mdEntries) {
        roots[md.name] = dirname(md.name) === "." ? "" : dirname(md.name).replace(/\\/g, "/");
      }

      const result = importSkills(parsed, userId, allFiles, roots);
      return Response.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ 
        imported: 0, 
        errors: [`Zip 文件解析失败: ${message}`] 
      }, { status: 200 });
    }
  }

  if (filename?.toLowerCase().endsWith(".md")) {
    const content = buf.toString("utf-8");
    const p = parseSkillMd(content);
    const result = importSkills(
      p ? [{ sourcePath: filename || "SKILL.md", parsed: p }] : [],
      userId
    );
    return Response.json(result);
  }

  return Response.json({ error: "不支持的文件类型" }, { status: 400 });
}

function handleContent(body: Record<string, unknown>, userId: string): Response {
  const items = Array.isArray(body.items) ? (body.items as { name: string; content: string }[]) : [];
  const parsed = parseMdEntries(items);
  const result = importSkills(parsed, userId);
  return Response.json(result);
}

async function handleGitHub(repoUrl: string, userId: string): Promise<Response> {
  const match = repoUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/);
  if (!match) return Response.json({ error: "无效的 GitHub 仓库链接" }, { status: 400 });

  const [, owner, repo] = match;
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
    { headers: { Accept: "application/vnd.github+json", "User-Agent": "agent-terminal" } }
  );
  if (!treeRes.ok) return Response.json({ error: `GitHub API 错误: ${treeRes.status}` }, { status: 400 });

  const tree = await treeRes.json();
  const mdFiles: string[] = (tree.tree || [])
    .filter((e: { path?: string; type?: string }) => typeof e.path === "string" && e.path.endsWith(".md") && e.type === "blob")
    .map((e: { path: string }) => e.path);

  const result: ParsedEntry[] = [];
  for (const filePath of mdFiles) {
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { Accept: "application/vnd.github.raw+json", "User-Agent": "agent-terminal" } }
    );
    if (!fileRes.ok) continue;
    const p = parseSkillMd(await fileRes.text());
    if (p) result.push({ sourcePath: filePath, parsed: p });
  }
  return Response.json(importSkills(result, userId));
}

function handleLocal(name: string, userId: string): Response {
  try {
    if (!name) return Response.json({ error: "缺少技能名称" }, { status: 400 });

    // Scan the skills directory for a matching skill
    const parentDir = resolve(join(process.cwd(), "../", "skills"));
    const items = readdirSync(parentDir, { withFileTypes: true });
    let skillDir: string | null = null;

    for (const item of items) {
      if (!item.isDirectory()) continue;
      const skillPath = join(parentDir, item.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, "utf-8");
      const p = parseSkillMd(content);
      if (p && p.name === name) {
        skillDir = item.name;
        break;
      }
    }

    if (!skillDir) {
      return Response.json({ error: `本地未找到技能「${name}」` }, { status: 404 });
    }

    const skillPath = join(parentDir, skillDir, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    const p = parseSkillMd(content);
    if (!p) return Response.json({ error: `「${name}」的 SKILL.md 格式不符合要求` }, { status: 400 });

    const result = importSkills([{ sourcePath: "SKILL.md", parsed: p }], userId);
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ imported: 0, errors: [`安装失败: ${message}`] });
  }
}
