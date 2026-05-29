import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bot,
  FileText,
  Clipboard,
  Search,
  Mail,
  Users,
  Code,
  Database,
  Languages,
  Lightbulb,
  BarChart3,
  LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  bot: Bot,
  "file-text": FileText,
  clipboard: Clipboard,
  search: Search,
  mail: Mail,
  users: Users,
  code: Code,
  database: Database,
  languages: Languages,
  lightbulb: Lightbulb,
  "chart-bar": BarChart3,
  "bar-chart": BarChart3,
};

const categoryStyles: Record<string, { bg: string; text: string; border: string }> = {
  code: { bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-600 dark:text-sky-400", border: "border-sky-200 dark:border-sky-900" },
  programming: { bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-600 dark:text-sky-400", border: "border-sky-200 dark:border-sky-900" },
  creative: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-900" },
  writing: { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-600 dark:text-violet-400", border: "border-violet-200 dark:border-violet-900" },
  data: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-900" },
  analysis: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-900" },
  translate: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-600 dark:text-rose-400", border: "border-rose-200 dark:border-rose-900" },
  general: { bg: "bg-primary/5 dark:bg-primary/15", text: "text-primary", border: "border-primary/20 dark:border-primary/25" },
  default: { bg: "bg-slate-50 dark:bg-slate-900/50", text: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-slate-800" },
};

function getCategoryStyle(category: string) {
  const key = category.toLowerCase();
  return categoryStyles[key] || categoryStyles.default;
}

export function AgentCard({
  id,
  name,
  description,
  icon,
  category,
}: {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}) {
  const Icon = iconMap[icon] || Bot;
  const style = getCategoryStyle(category);

  return (
    <Link href={`/agent/${id}`}>
      <Card className="h-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 group border-border/60 cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${style.bg} ${style.text} ring-1 ${style.border} transition-transform duration-300 group-hover:scale-105`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">{name}</CardTitle>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium mt-1.5 ${style.bg} ${style.text}`}>
                  {category}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm line-clamp-2 leading-relaxed">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}
