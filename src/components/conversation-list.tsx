"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, ArrowLeft, Bot } from "lucide-react";
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
  onDelete: (id: string) => void;
}

function SectionLabel({ icon: Icon, label }: { icon: typeof Bot; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 mb-2">
      <Icon className="h-3 w-3 text-sidebar-foreground/30" />
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground/35">
        {label}
      </span>
      <div className="flex-1 h-px bg-sidebar-border/50 ml-1" />
    </div>
  );
}

export function ConversationList({
  conversations,
  agentId,
  agentName,
  currentId,
  onNew,
  onDelete,
}: ConversationListProps) {
  const router = useRouter();

  return (
    <div className="w-[280px] border-r flex flex-col h-full bg-sidebar shrink-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b">
        {/* Back + Agent Info */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => router.push("/")}
            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors shrink-0"
            title="返回首页"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1 rounded-md bg-primary/10 shrink-0">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold text-sidebar-foreground truncate">{agentName}</span>
          </div>
        </div>

        {/* New Conversation Button */}
        <Button
          onClick={onNew}
          className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm shadow-primary/20 rounded-xl"
        >
          <Plus className="h-4 w-4 mr-2" />
          新对话
        </Button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 py-4">
          <SectionLabel icon={MessageSquare} label="对话记录" />
          {conversations.length === 0 ? (
            <div className="text-xs text-sidebar-foreground/25 text-center py-8 border border-dashed border-sidebar-border/40 rounded-xl">
              还没有对话记录
              <p className="mt-1 text-[11px]">点击上方按钮开始新对话</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => {
                const active = currentId === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => router.push(`/agent/${agentId}?conversation=${conv.id}`)}
                    title={conv.title}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-all duration-200",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-primary" />
                    )}
                    <MessageSquare
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active ? "text-primary/70" : "text-muted-foreground/40"
                      )}
                    />
                    <span className="truncate flex-1">{conv.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-all shrink-0 p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground/30"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
