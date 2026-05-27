"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  agentId: string;
  currentId?: string;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ConversationList({
  conversations,
  agentId,
  currentId,
  onNew,
  onDelete,
}: ConversationListProps) {
  const router = useRouter();

  return (
    <div className="w-64 border-r flex flex-col h-full bg-muted/30">
      <div className="p-3 border-b">
        <Button variant="outline" size="sm" className="w-full" onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          新对话
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              暂无对话记录
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => router.push(`/agent/${agentId}?conversation=${conv.id}`)}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors mb-1 cursor-pointer",
                  currentId === conv.id && "bg-accent"
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
