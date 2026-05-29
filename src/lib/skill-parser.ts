import * as yaml from "js-yaml";

export interface ParsedSkill {
  name: string;
  description: string;
  category: string;
  icon: string;
  toolsAllowed: string[];
  systemPrompt: string;
  displayName?: string;
}

export function parseSkillMd(content: string): ParsedSkill | null {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  let front: Record<string, unknown>;
  try {
    front = (yaml.load(match[1]) || {}) as Record<string, unknown>;
  } catch {
    return null;
  }

  const name =
    typeof front.name === "string"
      ? front.name
      : typeof front.name_cn === "string"
        ? front.name_cn
        : "";
  const description =
    typeof front.description === "string"
      ? front.description
      : typeof front.desc === "string"
        ? front.desc
        : "";
  if (!name || !description) return null;

  let tools: string[] = [];
  const raw = front.tools_allowed || front["allowed-tools"] || front.tools || [];
  if (Array.isArray(raw)) tools = raw;

  const body = match[2].trim();
  if (!body) return null;

  const category = typeof front.category === "string" ? front.category : "general";
  const icon = typeof front.icon === "string" ? front.icon : "sparkles";
  const displayName =
    typeof front.name_cn === "string"
      ? front.name_cn
      : typeof front.display_name === "string"
        ? front.display_name
        : undefined;

  return {
    name,
    description: typeof description === "string" ? description : String(description),
    category,
    icon,
    toolsAllowed: tools,
    systemPrompt: body,
    displayName,
  };
}
