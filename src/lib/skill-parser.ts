import * as yaml from "js-yaml";

export interface ParsedSkill {
  name: string;
  description: string;
  category: string;
  icon: string;
  toolsAllowed: string[];
  systemPrompt: string;
}

export function parseSkillMd(content: string): ParsedSkill | null {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  let front: Record<string, any>;
  try {
    front = (yaml.load(match[1]) || {}) as Record<string, any>;
  } catch {
    return null;
  }

  const name = front.name || front.name_cn || "";
  const description = front.description || front.desc || "";
  if (!name || !description) return null;

  let tools: string[] = [];
  const raw = front.tools_allowed || front["allowed-tools"] || front.tools || [];
  if (Array.isArray(raw)) tools = raw;

  const body = match[2].trim();
  if (!body) return null;

  return {
    name,
    description: typeof description === "string" ? description : String(description),
    category: front.category || "general",
    icon: front.icon || "sparkles",
    toolsAllowed: tools,
    systemPrompt: body,
  };
}
