"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Terminal, FileCode, Globe, Search, LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  read_file: FileCode,
  write_file: FileCode,
  shell_exec: Terminal,
  web_fetch: Globe,
  web_search: Search,
};

export function ToolCard({
  name,
  input,
  output,
  ok,
  durationMs,
}: {
  id: string;
  name: string;
  input: string;
  output: string;
  ok: boolean;
  durationMs: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = iconMap[name] || Terminal;

  let inputDisplay = "";
  try {
    const parsed = JSON.parse(input);
    inputDisplay = parsed.command || parsed.path || parsed.url || parsed.query || input;
  } catch {
    inputDisplay = input;
  }

  return (
    <div className="mb-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left text-xs rounded-md border px-2.5 py-1.5 hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{name}</span>
        <span className="truncate text-muted-foreground">{inputDisplay}</span>
        <span className="ml-auto text-xs text-muted-foreground/60">{(durationMs / 1000).toFixed(1)}s</span>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
      </button>
      {expanded && (
        <div className="mt-1 text-xs rounded-md border bg-muted/30 p-2 font-mono whitespace-pre-wrap max-h-48 overflow-auto">
          {output}
        </div>
      )}
      {name === "generate_document" && ok && <DownloadLink output={output} />}
    </div>
  );
}

function DownloadLink({ output }: { output: string }) {
  let data: { url?: string; filename?: string } = {};
  try { data = JSON.parse(output); } catch {}
  if (!data.url) return null;
  return (
    <a
      href={data.url}
      download={data.filename}
      className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-primary hover:underline px-2.5 py-1 rounded-md border border-primary/20 bg-primary/5"
    >
      📄 下载 {data.filename}
    </a>
  );
}
