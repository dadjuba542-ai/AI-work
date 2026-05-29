import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync } from "fs";
import { join, resolve, sep } from "path";
import { lookup } from "dns/promises";
import { isIP } from "net";
import type { ToolDef } from "@/lib/llm";
import { db } from "@/db";
import { skills } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildSkillPromptBundle } from "@/lib/skill-runtime";
import { generateDocument } from "./generate-document";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (args: any, ctx?: { userId?: string; role?: string }) => Promise<string>;

const ROOT = process.cwd();
const TIMEOUT = 30000;
const MAX_FILE_SIZE = 1024 * 1024;
const MAX_WEB_TEXT = 20000;
const ROOT_PREFIX = ROOT.endsWith(sep) ? ROOT : ROOT + sep;

let minimaxConfig: { apiKey: string; baseUrl: string } | null = null;

export function setMiniMaxConfig(apiKey: string, baseUrl: string) {
  minimaxConfig = { apiKey, baseUrl };
}

function safePath(input: string): string {
  const resolved = resolve(join(ROOT, input));
  if (!(resolved === ROOT || resolved.startsWith(ROOT_PREFIX))) {
    throw new Error(`Path outside workspace: ${input}`);
  }
  return resolved;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:");
}

async function assertSafeFetchUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost") throw new Error("Blocked host");

  const ipType = isIP(host);
  if (ipType === 4 && isPrivateIpv4(host)) throw new Error("Blocked private IP");
  if (ipType === 6 && isPrivateIpv6(host)) throw new Error("Blocked private IP");

  if (ipType === 0) {
    const addrs = await lookup(host, { all: true });
    for (const a of addrs) {
      if ((a.family === 4 && isPrivateIpv4(a.address)) || (a.family === 6 && isPrivateIpv6(a.address))) {
        throw new Error("Blocked host (resolves to private IP)");
      }
    }
  }

  return parsed.toString();
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(html: string): string {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const title = noScripts.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const body = noScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const compact = decodeHtmlEntities(body)
    .replace(/\r/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const clipped = compact.slice(0, MAX_WEB_TEXT);
  return title ? `Title: ${decodeHtmlEntities(title)}\n\n${clipped}` : clipped;
}

const toolHandlers: Record<string, ToolHandler> = {
  async read_file(args: { path: string }) {
    const fp = safePath(args.path);
    if (!existsSync(fp)) throw new Error(`File not found: ${args.path}`);
    const stat = statSync(fp);
    if (stat.size > MAX_FILE_SIZE) throw new Error(`File too large: ${args.path} (${stat.size} bytes)`);
    const content = readFileSync(fp, "utf-8");
    return content.slice(0, MAX_FILE_SIZE);
  },

  async write_file(args: { path: string; content: string }) {
    const fp = safePath(args.path);
    writeFileSync(fp, args.content, "utf-8");
    return `Written ${args.content.length} bytes to ${args.path}`;
  },

  async shell_exec(args: { command: string; workdir?: string }, ctx) {
    if (ctx?.role !== "admin") {
      return "Error: shell_exec is restricted to admin users";
    }
    const BLOCKED_PATTERNS = [
      /^(sudo|su|chmod|chown|dd|mkfs|mount|umount)\b/,
      /\brm\s+-rf\b/,
      /\b(ntttcp|wrk|siege|boom|stress)\b/i,
      /\b(curl|wget|nc|ncat|telnet|ssh|scp|rsync|ftp|sftp)\b/i,
    ];
    const cmd = args.command.trim();
    if (cmd.length > 5000) return "Error: Command too long (max 5000 chars)";
    if (/[|;&`]/.test(cmd) || /\$\(/.test(cmd) || />|</.test(cmd)) {
      return "Error: Command contains blocked shell operators";
    }
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(cmd)) return `Error: Command blocked by security policy: ${pattern}`;
    }
    const tmpDir = join(process.cwd(), "data", "tmp", "shell", crypto.randomUUID());
    mkdirSync(tmpDir, { recursive: true });
    const cwd = args.workdir ? safePath(args.workdir) : tmpDir;
    try {
      const result = execSync(cmd, {
        cwd,
        timeout: TIMEOUT,
        maxBuffer: MAX_FILE_SIZE,
        encoding: "utf-8",
      });
      return (result as string).slice(0, MAX_FILE_SIZE) || "(no output)";
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  },

  async web_fetch(args: { url: string }) {
    const url = await assertSafeFetchUrl(args.url);
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    const html = await res.text();
    const text = htmlToPlainText(html);
    const statusLine = `Fetched: ${url}\nStatus: ${res.status}\n`;
    return `${statusLine}\n${text || "(empty page text)"}`.slice(0, MAX_FILE_SIZE);
  },

  async web_search(args: { query: string }) {
    const q = encodeURIComponent(args.query);
    const url = `https://lite.duckduckgo.com/lite/?q=${q}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    const html = await res.text();
    const results: string[] = [];
    const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      results.push(`  [${match[2].replace(/<[^>]*>/g, "").trim()}](${match[1]})`);
    }
    return results.length > 0
      ? `DuckDuckGo results for "${args.query}":\n${results.slice(0, 5).join("\n")}`
      : `No results for "${args.query}"`;
  },

  async load_skill(args: { name: string }) {
    const [skill] = db.select().from(skills).where(eq(skills.name, args.name)).all();
    if (!skill) {
      const all = db.select().from(skills).all();
      const names = all.map((s) => s.name).join(", ");
      return `Skill "${args.name}" not found. Available: ${names}`;
    }

    const bundle = buildSkillPromptBundle(skill.id, skill.systemPrompt);

    return JSON.stringify({
      loaded: true,
      name: skill.name,
      prompt: bundle.prompt,
      dir: `AGENT/data/skills/${skill.id}`,
      files: bundle.filesTree,
    });
  },

  async discover_skill_files(args: { skill_id?: string; name?: string }) {
    let skillId = args.skill_id;
    if (!skillId && args.name) {
      const [skill] = db.select().from(skills).where(eq(skills.name, args.name)).all();
      if (!skill) return `Skill "${args.name}" not found`;
      skillId = skill.id;
    }
    if (!skillId) return "Provide either skill_id or name";

    const dirPath = resolve(join(process.cwd(), "data", "skills", skillId));
    return buildFileTree(dirPath);
  },

  async generate_image(args: { prompt: string; n?: number; aspect_ratio?: string }) {
    if (!minimaxConfig) return "MiniMax API not configured";
    const res = await fetch(`${minimaxConfig.baseUrl}/v1/image/generation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${minimaxConfig.apiKey}` },
      body: JSON.stringify({ model: "image-01", prompt: args.prompt, n: args.n || 1, aspect_ratio: args.aspect_ratio || "1:1" }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const data = await res.json();
    if (!res.ok) return `Image generation failed (${res.status}): ${JSON.stringify(data)}`;
    const urls = ((data.data || []) as Array<{ url?: string }>).map((d) => d.url || "").filter(Boolean).join("\n");
    return urls || JSON.stringify(data);
  },

  async text_to_speech(args: { text: string; voice_id?: string; speed?: number }) {
    if (!minimaxConfig) return "MiniMax API not configured";
    const res = await fetch(`${minimaxConfig.baseUrl}/v1/t2a/http`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${minimaxConfig.apiKey}` },
      body: JSON.stringify({
        model: "speech-2.6-hd",
        text: args.text.slice(0, 10000),
        voice_id: args.voice_id || "female-shaonv",
        speed: args.speed || 1.0,
        format: "mp3",
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return `TTS failed (${res.status}): ${await res.text()}`;
    const buf = Buffer.from(await res.arrayBuffer());
    const name = `tts-${Date.now()}.mp3`;
    const outDir = resolve(join(process.cwd(), "data", "outputs"));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, name), buf);
    return `Audio saved: data/outputs/${name} (${buf.length} bytes)`;
  },

  async generate_music(args: { prompt: string; lyrics?: string }) {
    if (!minimaxConfig) return "MiniMax API not configured";
    const res = await fetch(`${minimaxConfig.baseUrl}/v1/music/generation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${minimaxConfig.apiKey}` },
      body: JSON.stringify({ prompt: args.prompt, lyrics: args.lyrics || "" }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await res.json();
    if (!res.ok) return `Music generation failed (${res.status}): ${JSON.stringify(data)}`;
    if (data.result?.audio_url) return `Music generated: ${data.result.audio_url}`;
    if (data.task_id) return `Music task created: ${data.task_id}. Check back with task_id.`;
    return JSON.stringify(data);
  },

  async generate_document(args: { format: string; filename: string; content: string }, ctx) {
    return generateDocument(args, ctx?.userId);
  },
};

function buildFileTree(dirPath: string): string {
  try {
    const items = readdirSync(dirPath, { withFileTypes: true });
    const lines: string[] = [];
    for (const item of items) {
      const fullPath = join(dirPath, item.name);
      if (item.isDirectory()) {
        const subTree = buildFileTree(fullPath);
        const subLines = subTree.split("\n").map((l) => "  " + l).join("\n");
        lines.push(`📁 ${item.name}/\n${subLines}`);
      } else {
        const size = statSync(fullPath).size;
        lines.push(`📄 ${item.name} (${size} bytes)`);
      }
    }
    return lines.join("\n") || "(empty directory)";
  } catch {
    return "(no skill files on disk)";
  }
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return toolHandlers[name];
}

export function getToolList(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read the contents of a file. Returns file content or error.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to workspace root" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description: "Write content to a file. Creates file if it doesn't exist, overwrites if it does.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to workspace root" },
            content: { type: "string", description: "Content to write" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "shell_exec",
        description: "Execute a shell command. Use for running scripts, tests, builds, git operations, etc.",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to execute" },
            workdir: { type: "string", description: "Working directory relative to workspace root (optional)" },
          },
          required: ["command"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "web_fetch",
        description: "Fetch content from a URL. Returns the raw HTML or text response.",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch" },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Search the web for information using DuckDuckGo. Returns top result links.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "load_skill",
        description: "Load a skill's complete instructions and files into context. Call this when you need to follow a specific workflow or use advanced capabilities.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the skill to load (e.g. 'Write', 'Code Review')" },
          },
          required: ["name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "discover_skill_files",
        description: "List all files in a skill's directory tree. Use after load_skill to see what scripts and reference docs are available.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the skill (e.g. 'Write')" },
          },
          required: ["name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_image",
        description: "Generate an image from a text prompt using MiniMax AI. Returns image URL(s).",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Image description in detail" },
            n: { type: "number", description: "Number of images (1-4)" },
            aspect_ratio: { type: "string", description: "Aspect ratio: 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9" },
          },
          required: ["prompt"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "text_to_speech",
        description: "Convert text to natural speech audio using MiniMax TTS. Saves mp3 file to data/outputs/.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to convert to speech (max 10000 chars)" },
            voice_id: { type: "string", description: "Voice ID. Default: female-shaonv" },
            speed: { type: "number", description: "Speech speed (0.5-2.0)" },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_music",
        description: "Generate music from a prompt and optional lyrics using MiniMax AI. Returns URL or task ID.",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "Music style description (e.g. calm piano, upbeat pop)" },
            lyrics: { type: "string", description: "Optional lyrics for the song" },
          },
          required: ["prompt"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_document",
        description: "生成可下载的办公文档（docx/ xlsx/ md）并返回下载链接。当用户要求生成文档、导出报告、保存分析结果时使用。content 使用 Markdown 格式描述内容。",
        parameters: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["docx", "xlsx", "pptx", "md"], description: "文档格式" },
            filename: { type: "string", description: "文件名（不含扩展名）" },
            content: { type: "string", description: "文档内容（Markdown 格式）" },
          },
          required: ["format", "filename", "content"],
        },
      },
    },
  ];
}
