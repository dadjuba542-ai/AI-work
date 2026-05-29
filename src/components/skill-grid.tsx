"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Star, Search, Sparkles, Bot, FileText, ClipboardList, Search as SearchIcon,
  Mail, Users, Code2, Database, Languages, Lightbulb, BarChart3, SlidersHorizontal,
  Briefcase, PenTool, Cpu, FlaskConical, Camera, Music2, Scale, Globe, Headphones, DollarSign, HeartPulse, GraduationCap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const iconMap: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  bot: Bot,
  "file-text": FileText,
  clipboard: ClipboardList,
  search: SearchIcon,
  mail: Mail,
  users: Users,
  code: Code2,
  database: Database,
  languages: Languages,
  lightbulb: Lightbulb,
  "chart-bar": BarChart3,
};

const skillIconPool: LucideIcon[] = [
  Sparkles,
  FileText,
  ClipboardList,
  SearchIcon,
  Mail,
  Users,
  Code2,
  Database,
  Languages,
  Lightbulb,
  BarChart3,
  Briefcase,
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
  GraduationCap,
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getSkillIcon(skill: Skill): LucideIcon {
  const explicit = iconMap[skill.icon];
  if (explicit && explicit !== Sparkles && explicit !== Bot) return explicit;
  const idx = hashString(`${skill.id}:${skill.name}`) % skillIconPool.length;
  return skillIconPool[idx];
}

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  favorited: boolean;
  displayName?: string;
}

interface SkillGridProps {
  skills: Skill[];
  onToggleFavorite: (skillId: string) => void;
}

export function SkillGrid({ skills, onToggleFavorite }: SkillGridProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const categories = [...new Set(skills.map((s) => s.category))];

  const filtered = skills.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (category && s.category !== category) return false;
    return true;
  });

  return (
    <div className="min-h-full p-2 sm:p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/65 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm sm:flex">
          <Sparkles className="h-3.5 w-3.5 text-[#16a085]" />
          {filtered.length} 个可用技能
        </div>
      </div>

      <section className="app-surface brand-sheen mb-4 overflow-hidden rounded-[2rem] px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-foreground/70 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-[#16a085]" />
            Skill Marketplace
          </div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">把常用技能收藏到对话工作流里。</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            从写作、代码、分析到自动化处理，先筛选收藏，再在输入区快速组合调用。
          </p>
        </div>
      </section>

      <div className="soft-panel mb-4 flex flex-col gap-2 rounded-2xl p-2 sm:flex-row">
        <div className="relative min-w-0 flex-1 sm:w-80">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            placeholder="搜索技能..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl border-border/70 bg-card/70 pl-10 text-sm"
          />
        </div>
        <div className="relative">
          <SlidersHorizontal className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-input bg-card/70 pl-10 pr-8 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/25 sm:w-40"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="soft-panel rounded-3xl py-16 text-center text-muted-foreground">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">暂无匹配的技能</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="group relative rounded-3xl border border-border/70 bg-card/75 p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-ring/35 hover:bg-card hover:shadow-[0_16px_42px_rgba(32,28,18,0.1)]"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f0ff]">
                    {(() => {
                      const Icon = getSkillIcon(s);
                      return <Icon className="h-5 w-5 text-[#3678ff]" />;
                    })()}
                  </div>
                  <span className="truncate text-sm font-semibold">{s.displayName || s.name}</span>
                </div>
                <button
                  onClick={() => onToggleFavorite(s.id)}
                  className="shrink-0 rounded-full border border-transparent p-2 transition-colors hover:border-border hover:bg-muted"
                  title={s.favorited ? "取消收藏" : "收藏"}
                >
                  <Star
                    className={`h-4 w-4 transition-colors ${
                      s.favorited
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/40 hover:text-muted-foreground"
                    }`}
                  />
                </button>
              </div>
              <p className="mb-4 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-muted-foreground">
                {s.description}
              </p>
              <Badge variant="secondary" className="rounded-full text-[10px] font-normal">
                {s.category}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
