import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import * as yaml from "js-yaml";

const MAX_SECTION_CHARS = 24000;

type WorkflowStep = {
  name?: string;
  prompt?: string;
  instruction?: string;
  prompt_file?: string;
  script?: string;
  command?: string;
};

function limitText(input: string, max = MAX_SECTION_CHARS): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max)}\n\n[truncated ${input.length - max} chars]`;
}

function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

function parseFrontmatter(content: string): { front: Record<string, unknown>; body: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { front: {}, body: normalized.trim() };
  try {
    const front = (yaml.load(match[1]) || {}) as Record<string, unknown>;
    return { front, body: (match[2] || "").trim() };
  } catch {
    return { front: {}, body: normalized.trim() };
  }
}

function normalizeWorkflow(raw: unknown): WorkflowStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v) => typeof v === "object" && v !== null)
    .map((v) => v as WorkflowStep);
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function buildSkillPromptBundle(skillId: string, fallbackPrompt: string): {
  prompt: string;
  filesTree: string;
} {
  const dir = resolve(join(process.cwd(), "data", "skills", skillId));
  const skillMdPath = join(dir, "SKILL.md");
  const skillMdRaw = readIfExists(skillMdPath);

  const sections: string[] = [fallbackPrompt.trim()];
  let workflow: WorkflowStep[] = [];

  if (skillMdRaw) {
    const parsed = parseFrontmatter(skillMdRaw);
    const wf = parsed.front.workflow ?? parsed.front.steps ?? parsed.front.prompt_chain;
    workflow = normalizeWorkflow(wf);
    if (parsed.body && parsed.body !== fallbackPrompt.trim()) {
      sections.push(`## Skill Body\n${limitText(parsed.body)}`);
    }
  }

  const promptDir = join(dir, "prompts");
  const promptFiles = listFiles(promptDir).filter((name) => name.toLowerCase().endsWith(".md"));
  if (promptFiles.length > 0) {
    const promptBlocks = promptFiles
      .map((name) => {
        const content = readIfExists(join(promptDir, name)) || "";
        return `### prompts/${name}\n${limitText(content.trim())}`;
      })
      .join("\n\n");
    sections.push(`## Prompt Blocks\n${promptBlocks}`);
  }

  if (workflow.length > 0) {
    const workflowText = workflow
      .map((step, idx) => {
        const title = step.name?.trim() || `Step ${idx + 1}`;
        const instruction = step.instruction || step.prompt || "";
        const promptFile = step.prompt_file?.trim();
        const command = step.command?.trim() || step.script?.trim();
        const parts: string[] = [`### ${idx + 1}. ${title}`];

        if (instruction) {
          parts.push(`Instruction:\n${limitText(instruction.trim())}`);
        }

        if (promptFile) {
          const path = join(dir, promptFile);
          const fileContent = readIfExists(path);
          if (fileContent) {
            parts.push(`Prompt File (${promptFile}):\n${limitText(fileContent.trim())}`);
          } else {
            parts.push(`Prompt File (${promptFile}): [missing]`);
          }
        }

        if (command) {
          parts.push(
            `Script Command:\nRun with \`shell_exec\` using workdir="AGENT/data/skills/${skillId}" and command="${command.replace(/"/g, '\\"')}".`
          );
        }

        return parts.join("\n\n");
      })
      .join("\n\n");
    sections.push(`## Workflow\n${workflowText}`);
  }

  const scripts = listFiles(join(dir, "scripts"));
  if (scripts.length > 0) {
    sections.push(
      `## Available Scripts\n${scripts
        .map((name) => `- scripts/${name}`)
        .join("\n")}\nUse \`shell_exec\` with workdir="AGENT/data/skills/${skillId}" when scripts are needed.`
    );
  }

  const filesTree = buildTree(dir);
  return {
    prompt: sections.filter(Boolean).join("\n\n---\n\n"),
    filesTree,
  };
}

function buildTree(dirPath: string): string {
  try {
    const items = readdirSync(dirPath, { withFileTypes: true });
    const lines: string[] = [];
    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      if (item.isDirectory()) {
        const subTree = buildTree(fullPath);
        const subLines = subTree.split("\n").map((line) => `  ${line}`).join("\n");
        lines.push(`📁 ${item.name}/\n${subLines}`);
      } else {
        lines.push(`📄 ${item.name}`);
      }
    }
    return lines.join("\n") || "(empty directory)";
  } catch {
    return "(no skill files on disk)";
  }
}
