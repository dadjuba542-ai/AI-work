"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  SlidersHorizontal,
  ArrowLeft,
  Bot,
  Code,
  Lightbulb,
  FileText,
  BarChart3,
  Languages,
  Palette,
  Sparkles,
  ArrowUpRight,
  Briefcase,
  Megaphone,
  GraduationCap,
  BookOpen,
  ClipboardList,
  PenTool,
  Cpu,
  FlaskConical,
  Camera,
  Music2,
  Scale,
  Globe,
  Headphones,
  DollarSign,
  HeartPulse,
} from "lucide-react";

type Agent = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
};

const categoryStyles: Record<string, { icon: typeof Bot; bg: string; text: string; border: string; badge: string }> = {
  code: { icon: Code, bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-600 dark:text-sky-400", border: "border-sky-200 dark:border-sky-900", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300" },
  programming: { icon: Code, bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-600 dark:text-sky-400", border: "border-sky-200 dark:border-sky-900", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300" },
  creative: { icon: Palette, bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-900", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300" },
  writing: { icon: FileText, bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-600 dark:text-violet-400", border: "border-violet-200 dark:border-violet-900", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300" },
  data: { icon: BarChart3, bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-900", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300" },
  analysis: { icon: BarChart3, bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-900", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300" },
  translate: { icon: Languages, bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-600 dark:text-rose-400", border: "border-rose-200 dark:border-rose-900", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300" },
  general: { icon: Lightbulb, bg: "bg-primary/5 dark:bg-primary/15", text: "text-primary", border: "border-primary/20 dark:border-primary/25", badge: "bg-primary/10 text-primary dark:bg-primary/20" },
  default: { icon: Bot, bg: "bg-slate-50 dark:bg-slate-900/50", text: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-slate-800", badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const namedIconMap: Record<string, LucideIcon> = {
  bot: Bot,
  code: Code,
  "file-text": FileText,
  "chart-bar": BarChart3,
  languages: Languages,
  lightbulb: Lightbulb,
};

const expertIconPool: LucideIcon[] = [
  Briefcase,
  Megaphone,
  GraduationCap,
  BookOpen,
  ClipboardList,
  PenTool,
  Cpu,
  FlaskConical,
  Camera,
  Music2,
  Scale,
  Globe,
  Headphones,
  DollarSign,
  HeartPulse,
  Code,
  FileText,
  BarChart3,
  Languages,
  Palette,
  Sparkles,
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getExpertIcon(agent: Agent): LucideIcon {
  const explicit = namedIconMap[agent.icon];
  if (explicit && explicit !== Bot) return explicit;
  const idx = hashString(`${agent.id}:${agent.name}`) % expertIconPool.length;
  return expertIconPool[idx];
}

function getCategoryStyle(category: string) {
  const key = category.toLowerCase();
  return categoryStyles[key] || categoryStyles.default;
}

export function ExpertGrid({
  agents,
  embedded = false,
  onSelectAgent,
}: {
  agents: Agent[];
  embedded?: boolean;
  onSelectAgent?: (id: string) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const categories = ["all", ...new Set(agents.map((a) => a.category))];
  const universalAgent = agents.find((a) => a.name === "通用助手");

  const filtered = agents
    .filter((a) => !universalAgent || a.id !== universalAgent.id)
    .filter((agent) => {
      const matchSearch =
        !search ||
        agent.name.toLowerCase().includes(search.toLowerCase()) ||
        agent.description.toLowerCase().includes(search.toLowerCase());
      const matchCategory = category === "all" || agent.category === category;
      return matchSearch && matchCategory;
    });

  return (
    <div className={embedded ? "min-h-full" : "min-h-screen"}>
      <div className={embedded ? "mx-auto max-w-6xl px-1 py-1" : "mx-auto max-w-6xl px-4 py-6 sm:py-8"}>
        <div className="mb-6 flex items-center justify-between gap-3">
          {!embedded && (
            <Button variant="outline" onClick={() => router.push("/")} className="rounded-full">
              <ArrowLeft className="h-4 w-4" />
              返回工作台
            </Button>
          )}
          <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/65 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-[#3678ff]" />
            {filtered.length} 个可用专家
          </div>
        </div>

        <section className="app-surface brand-sheen mb-6 overflow-hidden rounded-[2rem] px-5 py-7 sm:px-8 sm:py-9">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-foreground/70 shadow-sm">
              <Bot className="h-3.5 w-3.5 text-[#16a085]" />
              Expert Gallery
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">选择一个专家，把任务交给更合适的助手。</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              从写作、代码、数据分析到翻译，专家助手会带着预设能力和推荐问题进入对话。
            </p>
          </div>
        </section>

        <div className="soft-panel mb-6 flex flex-col gap-3 rounded-2xl p-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              placeholder="搜索专家名称或能力描述"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl border-border/70 bg-card/70 pl-10 text-sm"
            />
          </div>
          <Select value={category} onValueChange={(v) => setCategory(v || "all")}>
            <SelectTrigger className="h-11 w-full rounded-xl border-border/70 bg-card/70 sm:w-44">
              <SlidersHorizontal className="h-4 w-4 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat === "all" ? "全部分类" : cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="soft-panel rounded-3xl py-20 text-center text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">没有找到匹配的专家</p>
            <p className="text-sm mt-1">试试其他关键词或分类</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((agent) => {
              const style = getCategoryStyle(agent.category);
              const Icon = getExpertIcon(agent);

              return (
                <Card
                  key={agent.id}
                  className="group cursor-pointer rounded-3xl border-border/70 bg-card/72 py-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-ring/35 hover:bg-card hover:shadow-[0_18px_45px_rgba(32,28,18,0.11)]"
                  onClick={() => onSelectAgent ? onSelectAgent(agent.id) : router.push(`/?agent=${agent.id}`)}
                >
                  <CardHeader className="pb-1 relative pr-10">
                    <ArrowUpRight className="absolute right-5 top-5 h-4 w-4 shrink-0 text-muted-foreground/35 transition-colors group-hover:text-[#3678ff]" />
                    <div className="flex items-start gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${style.bg} ${style.text} ring-1 ${style.border} transition-transform duration-300 group-hover:scale-105`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 pr-1">
                          <CardTitle className="line-clamp-2 text-base font-semibold leading-6">{agent.name}</CardTitle>
                          <span className={`mt-2 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${style.badge}`}>
                            {agent.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="line-clamp-4 min-h-[6rem] text-sm leading-6 break-words">
                      {agent.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
