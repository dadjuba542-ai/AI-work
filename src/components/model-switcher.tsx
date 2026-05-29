"use client";

import { cn } from "@/lib/utils";

interface ModelSwitcherProps {
  models: string[];
  current: string;
  onChange: (model: string) => void;
}

export function ModelSwitcher({ models, current, onChange }: ModelSwitcherProps) {
  if (models.length <= 1) return null;

  return (
    <div className="flex gap-1 overflow-x-auto rounded-full border border-border/70 bg-muted/55 p-1">
      {models.map((m) => {
        const label = m.replace("MiniMax-", "").replace("-highspeed", " 极速");
        const active = current === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-card/80"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
