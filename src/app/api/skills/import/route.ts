import { auth } from "@/auth";
import { db } from "@/db";
import { skills } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseSkillMd } from "@/lib/skill-parser";
import AdmZip from "adm-zip";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";

const SKILLS_DIR = resolve(join(process.cwd(), "data", "skills"));

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== "admin") {
      return Response.json({ error: "无权限" }, { status: 403 });
    }

    const body = await req.json();

    if (body.type === "base64") return handleBase64(body, (session.user as any).id);
    if (body.type === "github") return handleGitHub(body.repoUrl, (session.user as any).id);
    if (body.type === "content") return handleContent(body, (session.user as any).id);
    if (body.type === "local") return handleLocal(body.name, (session.user as any).id);

    return Response.json({ error: "不支持的导入方式" }, { status: 400 });
  } catch (err: any) {
    return Response.json({ imported: 0, errors: [`服务器错误: ${err.message}`] });
  }
}

function parseMdEntries(entries: { name: string; content: string }[]) {
  const result: ReturnType<typeof parseSkillMd>[] = [];
  for (const entry of entries) {
    const p = parseSkillMd(entry.content);
    if (p) result.push(p);
  }
  return result;
}

function saveSkillFiles(skillId: string, files: { name: string; content: Buffer }[]) {
  const dir = join(SKILLS_DIR, skillId);
  for (const f of files) {
    const fp = join(dir, f.name);
    mkdirSync(dirname(fp), { recursive: true });
    writeFileSync(fp, f.content);
  }
}

function importSkills(
  parsed: ReturnType<typeof parseSkillMd>[],
  userId: string,
  zipEntries?: { name: string; content: Buffer }[]
): { imported: number; errors: string[]; skillIds: string[] } {
  let imported = 0;
  const errors: string[] = [];
  const skillIds: string[] = [];
  const now = new Date().toISOString();

  for (const skill of parsed) {
    if (!skill) continue;
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
      icon: skill.icon,
      category: skill.category,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }).run();

    if (zipEntries) {
      const filtered = zipEntries.filter((e) => !e.name.endsWith(".md") || e.name.toLowerCase() !== "skill.md");
      saveSkillFiles(id, filtered);
    }

    skillIds.push(id);
    imported++;
  }

  return { imported, errors, skillIds };
}

function handleBase64(body: any, userId: string): Response {
  const { data, filename } = body;
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
        const entryName = ze.entryName;
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
      
      const result = importSkills(parsed, userId, allFiles);
      return Response.json(result);
    } catch (err: any) {
      return Response.json({ 
        imported: 0, 
        errors: [`Zip 文件解析失败: ${err.message}`] 
      }, { status: 200 });
    }
  }

  if (filename?.toLowerCase().endsWith(".md")) {
    const content = buf.toString("utf-8");
    const p = parseSkillMd(content);
    const result = importSkills(p ? [p] : [], userId);
    return Response.json(result);
  }

  return Response.json({ error: "不支持的文件类型" }, { status: 400 });
}

function handleContent(body: any, userId: string): Response {
  const items: { name: string; content: string }[] = body.items || [];
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
    .filter((e: any) => e.path.endsWith(".md") && e.type === "blob")
    .map((e: any) => e.path);

  const result: ReturnType<typeof parseSkillMd>[] = [];
  for (const filePath of mdFiles) {
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      { headers: { Accept: "application/vnd.github.raw+json", "User-Agent": "agent-terminal" } }
    );
    if (!fileRes.ok) continue;
    const p = parseSkillMd(await fileRes.text());
    if (p) result.push(p);
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

    const result = importSkills([p], userId);
    return Response.json(result);
  } catch (err: any) {
    return Response.json({ imported: 0, errors: [`安装失败: ${err.message}`] });
  }
}