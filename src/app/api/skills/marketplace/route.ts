import { auth } from "@/auth";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { parseSkillMd } from "@/lib/skill-parser";

const LOCAL_SKILLS_DIR = resolve(join(process.cwd(), "../", "skills"));

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const items = readdirSync(LOCAL_SKILLS_DIR);
  const available: any[] = [];

  for (const item of items) {
    const skillPath = join(LOCAL_SKILLS_DIR, item, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const content = readFileSync(skillPath, "utf-8");
    const parsed = parseSkillMd(content);
    if (parsed) {
      available.push({
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        icon: parsed.icon,
        toolsAllowed: parsed.toolsAllowed,
      });
    }
  }

  return Response.json(available);
}
