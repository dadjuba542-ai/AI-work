"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  agentId: string;
  agentName: string;
  currentId?: string;
  onNew: () => void;
}

export function ConversationList({
  conversations,
  agentId,
  agentName,
  currentId,
  onNew,
}: ConversationListProps) {
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
              <Link
                key={conv.id}
                href={`/agent/${agentId}?conversation=${conv.id}`}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors mb-1",
                    currentId === conv.id && "bg-accent"
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{conv.title}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
