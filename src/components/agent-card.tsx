import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  ChartBar,
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
  "chart-bar": ChartBar,
};

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

  return (
    <Link href={`/agent/${id}`}>
      <Card className="h-full hover:shadow-md hover:border-primary/50 transition-all cursor-pointer group">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{name}</CardTitle>
                <Badge variant="secondary" className="mt-1 text-xs">
                  {category}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-sm line-clamp-2">
            {description}
          </CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}
