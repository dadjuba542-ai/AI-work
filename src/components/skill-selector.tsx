"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  displayName?: string;
}

interface SkillSelectorProps {
  favoritedSkills: Skill[];
  activeSkillNames: string[];
  onToggle: (skillName: string) => void;
}

export function SkillSelector({ favoritedSkills, activeSkillNames, onToggle }: SkillSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (favoritedSkills.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {activeSkillNames.length > 0 ? `${activeSkillNames.length} 个技能` : "添加技能"}
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border bg-popover p-2 shadow-lg z-50">
          <p className="text-[11px] font-medium text-muted-foreground px-2 py-1.5">已收藏的技能</p>
          {favoritedSkills.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 px-2 py-3 text-center">暂无收藏的技能</p>
          ) : (
            <div className="space-y-0.5">
              {favoritedSkills.map((s) => {
                const active = activeSkillNames.includes(s.name);
                return (
                  <button
                    key={s.id}
                    onClick={() => onToggle(s.name)}
                    className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent transition-colors text-left"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        active ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm truncate block">{s.displayName || s.name}</span>
                      <span className="text-[10px] text-muted-foreground/60 truncate block">
                        {s.category}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
