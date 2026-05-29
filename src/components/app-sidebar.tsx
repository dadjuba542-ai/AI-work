"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Plus,
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  UserPlus,
  Zap,
  History,
  WandSparkles,
  Files,
  PenSquare,
  Table2,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  icon: string;
  category: string;
  isOfficial: boolean;
  reviewStatus: string;
}

interface Conversation {
  id: string;
  title: string;
  agentId?: string | null;
  updatedAt?: string;
}

interface AppSidebarProps {
  agents: Agent[];
  conversations: Conversation[];
  currentAgentId?: string;
  currentConversationId?: string;
  onNewChat: () => void;
  onSelectAgent: (id: string) => void;
  onSelectConversation: (convId: string) => void;
  onDeleteConversation: (convId: string) => void;
  onSearch: (q: string) => void;
  onSelectSkills?: () => void;
  onSelectExperts?: () => void;
  onSelectBatch?: () => void;
  onSelectCopydesk?: () => void;
  onSelectSheetdesk?: () => void;
  showSkills?: boolean;
  showExperts?: boolean;
  showBatch?: boolean;
  showCopydesk?: boolean;
  showSheetdesk?: boolean;
  onCreateAgent?: () => void;
}

const statusLabels: Record<string, { label: string; variant: "outline" | "secondary" | "destructive" }> = {
  none: { label: "草稿", variant: "outline" },
  pending: { label: "审核中", variant: "secondary" },
  rejected: { label: "已驳回", variant: "destructive" },
};

function SectionLabel({ icon: Icon, label }: { icon: typeof Bot; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 mb-2">
      <Icon className="h-3.5 w-3.5 text-sidebar-foreground/35" />
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/45">
        {label}
      </span>
      <div className="flex-1 h-px bg-sidebar-border/70 ml-1" />
    </div>
  );
}

function AgentItem({
  agent,
  active,
  onClick,
}: {
  agent: Agent;
  active: boolean;
  onClick: () => void;
}) {
  const st = statusLabels[agent.reviewStatus] || statusLabels.none;
  return (
    <div
      onClick={onClick}
      className={`
        group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm cursor-pointer
        transition-all duration-200 border
        ${active
          ? "bg-card border-sidebar-border text-sidebar-foreground font-semibold shadow-sm"
          : "bg-transparent border-transparent text-sidebar-foreground/68 hover:bg-card/70 hover:text-sidebar-foreground hover:border-sidebar-border/70"
        }
      `}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#3678ff]" />
      )}
      <div className={`p-1.5 rounded-lg shrink-0 ${active ? "bg-[#e8f0ff]" : "bg-sidebar-accent/60"}`}>
        <Bot className={`h-3.5 w-3.5 ${active ? "text-[#3678ff]" : "text-muted-foreground/60"}`} />
      </div>
      <span className="truncate flex-1">{agent.name}</span>
      {!agent.isOfficial && (
        <Badge variant={st.variant} className="text-[9px] px-1 py-0 h-4 font-normal shrink-0">
          {st.label}
        </Badge>
      )}
    </div>
  );
}

function ConversationItem({
  conversation,
  agentLabel,
  active,
  onClick,
  onDelete,
}: {
  conversation: Conversation;
  agentLabel: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      title={conversation.title}
      className={`
        group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm cursor-pointer
        transition-all duration-200
        ${active
          ? "bg-card text-sidebar-accent-foreground font-medium shadow-sm"
          : "text-sidebar-foreground/60 hover:bg-card/70 hover:text-sidebar-foreground"
        }
      `}
    >
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#16a085]" />
      )}
      <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary/70" : "text-muted-foreground/40"}`} />
      <div className="min-w-0 flex-1">
        <span className="truncate block">{conversation.title}</span>
        <span className="text-[10px] text-muted-foreground/65">{agentLabel}</span>
      </div>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition-all shrink-0 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground/40"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function AppSidebar({
  agents,
  conversations,
  currentAgentId,
  currentConversationId,
  onNewChat,
  onSelectAgent,
  onSelectConversation,
  onDeleteConversation,
  onSearch,
  onSelectSkills,
  onSelectExperts,
  onSelectBatch,
  onSelectCopydesk,
  onSelectSheetdesk,
  showSkills,
  showExperts,
  showBatch,
  showCopydesk,
  showSheetdesk,
  onCreateAgent,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const currentAgent = currentAgentId ? agents.find((a) => a.id === currentAgentId) : null;
  const myAgents = agents.filter((a) => !a.isOfficial);
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]));

  if (collapsed) {
    return (
      <div className="hidden w-[56px] border-r border-sidebar-border/80 flex-col items-center py-4 bg-sidebar/92 shrink-0 transition-all duration-300 md:flex">
        <button
          onClick={() => setCollapsed(false)}
          className="mb-3 p-2 rounded-xl hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
          title="展开"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mb-4 shadow-sm">
          <Bot className="h-4 w-4" />
        </div>

        <button
          onClick={onNewChat}
          className="mb-2 p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          title="新建对话"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          onClick={() => onSelectExperts?.()}
          className="mb-2 p-2 rounded-xl hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
          title="选择专家"
        >
          <Sparkles className="h-4 w-4" />
        </button>

          <button
            onClick={() => onSelectSkills?.()}
            className={`p-2 rounded-xl transition-colors ${
              showSkills
                ? "bg-sidebar-accent text-primary"
                : "hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground"
            }`}
            title="技能市场"
          >
            <Zap className="h-4 w-4" />
          </button>
          <button
            onClick={() => onSelectBatch?.()}
            className={`mt-2 p-2 rounded-xl transition-colors ${
              showBatch
                ? "bg-sidebar-accent text-primary"
                : "hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground"
            }`}
            title="批量处理"
          >
            <Files className="h-4 w-4" />
          </button>
          <button
            onClick={() => onSelectCopydesk?.()}
            className={`mt-2 p-2 rounded-xl transition-colors ${
              showCopydesk
                ? "bg-sidebar-accent text-primary"
                : "hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground"
            }`}
            title="文案工作台"
          >
            <PenSquare className="h-4 w-4" />
          </button>
          <button
            onClick={() => onSelectSheetdesk?.()}
            className={`mt-2 p-2 rounded-xl transition-colors ${
              showSheetdesk
                ? "bg-sidebar-accent text-primary"
                : "hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground"
            }`}
            title="表格工作台"
          >
            <Table2 className="h-4 w-4" />
          </button>
        </div>
      );
  }

  return (
    <div className="hidden w-[292px] border-r border-sidebar-border/80 flex-col bg-sidebar/92 shrink-0 transition-all duration-300 h-full md:flex">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="mb-4 rounded-2xl border border-sidebar-border/70 bg-card/58 p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <WandSparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">AI 工作台</p>
              <p className="truncate text-xs text-sidebar-foreground/52">对话、技能、专家助手</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sidebar-foreground/35" />
            <Input
              placeholder="搜索对话..."
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); onSearch(e.target.value); }}
              className="h-10 pl-8 text-sm bg-card/70 border-sidebar-border/70 rounded-xl focus-visible:ring-ring/20"
            />
          </div>
          <button
            onClick={() => setCollapsed(true)}
            className="p-2 rounded-full bg-sidebar-accent/60 hover:bg-sidebar-accent text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors shrink-0"
            title="收起"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>

        {/* New Chat Button */}
        <Button
          onClick={onNewChat}
          className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          新建对话
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 pb-5 space-y-5">
          {/* Current Agent */}
          <div>
            <SectionLabel icon={Sparkles} label="当前助手" />
            {currentAgent ? (
              <div className="flex items-center gap-3 bg-card/72 rounded-2xl px-3 py-3 border border-sidebar-border/80 shadow-sm">
                <div className="p-2 rounded-xl bg-[#e8f0ff] shrink-0">
                  <Bot className="h-4 w-4 text-[#3678ff]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{currentAgent.name}</p>
                  <p className="text-[11px] text-muted-foreground">{currentAgent.category}</p>
                </div>
                <button
                  onClick={onNewChat}
                  className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-card/72 rounded-2xl px-3 py-3 border border-sidebar-border/80 shadow-sm">
                <div className="p-2 rounded-xl bg-[#e8f0ff] shrink-0">
                  <Bot className="h-4 w-4 text-[#3678ff]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">通用助手</p>
                  <p className="text-[11px] text-muted-foreground">默认模式</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSelectExperts?.()}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm border transition-all duration-200 group ${
                showExperts
                  ? "border-sidebar-border bg-card shadow-sm"
                  : "border-sidebar-border/70 bg-card/45 hover:bg-card hover:border-sidebar-border"
              }`}
            >
              <Sparkles className="h-4 w-4 text-[#3678ff] transition-colors shrink-0" />
              <span className={`font-medium ${showExperts ? "text-sidebar-foreground" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"}`}>专家广场</span>
            </button>
            <button
              onClick={() => onSelectSkills?.()}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm border transition-all duration-200 group ${
                showSkills
                  ? "border-sidebar-border bg-card shadow-sm"
                  : "border-sidebar-border/70 bg-card/45 hover:bg-card hover:border-sidebar-border"
              }`}
            >
              <Zap className="h-4 w-4 shrink-0 text-[#16a085] transition-colors" />
              <span className={`font-medium ${showSkills ? "text-sidebar-foreground" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"}`}>技能市场</span>
            </button>
            <button
              onClick={() => onSelectBatch?.()}
              className={`col-span-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm border transition-all duration-200 group ${
                showBatch
                  ? "border-sidebar-border bg-card shadow-sm"
                  : "border-sidebar-border/70 bg-card/45 hover:bg-card hover:border-sidebar-border"
              }`}
            >
              <Files className="h-4 w-4 shrink-0 text-[#5b7cfa] transition-colors" />
              <span className={`font-medium ${showBatch ? "text-sidebar-foreground" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"}`}>批量处理</span>
            </button>
            <button
              onClick={() => onSelectCopydesk?.()}
              className={`col-span-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm border transition-all duration-200 group ${
                showCopydesk
                  ? "border-sidebar-border bg-card shadow-sm"
                  : "border-sidebar-border/70 bg-card/45 hover:bg-card hover:border-sidebar-border"
              }`}
            >
              <PenSquare className="h-4 w-4 shrink-0 text-[#7b61ff] transition-colors" />
              <span className={`font-medium ${showCopydesk ? "text-sidebar-foreground" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"}`}>文案工作台</span>
            </button>
            <button
              onClick={() => onSelectSheetdesk?.()}
              className={`col-span-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm border transition-all duration-200 group ${
                showSheetdesk
                  ? "border-sidebar-border bg-card shadow-sm"
                  : "border-sidebar-border/70 bg-card/45 hover:bg-card hover:border-sidebar-border"
              }`}
            >
              <Table2 className="h-4 w-4 shrink-0 text-[#2f9e44] transition-colors" />
              <span className={`font-medium ${showSheetdesk ? "text-sidebar-foreground" : "text-sidebar-foreground/70 group-hover:text-sidebar-foreground"}`}>表格工作台</span>
            </button>
          </div>

          {/* My Agents */}
          {(myAgents.length > 0 || onCreateAgent) && (
            <div>
              <div className="flex items-center justify-between px-3 mb-2">
                <div className="flex items-center gap-1.5">
                  <UserPlus className="h-3 w-3 text-sidebar-foreground/30" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground/35">
                    我的智能体
                  </span>
                </div>
                {onCreateAgent && (
                  <button
                    onClick={onCreateAgent}
                    className="p-1 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/30 hover:text-sidebar-foreground transition-colors"
                    title="新建智能体"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>
              {myAgents.length === 0 ? (
                <p className="text-xs text-sidebar-foreground/25 text-center py-4 border border-dashed border-sidebar-border/40 rounded-xl">
                  点击 + 创建你的第一个智能体
                </p>
              ) : (
                <div className="space-y-0.5">
                  {myAgents.map((a) => (
                    <AgentItem
                      key={a.id}
                      agent={a}
                      active={currentAgentId === a.id}
                      onClick={() => onSelectAgent(a.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Conversations */}
          <div>
            <SectionLabel icon={History} label="最近对话" />
            {conversations.length === 0 ? (
              <div className="text-xs text-sidebar-foreground/25 text-center py-6 border border-dashed border-sidebar-border/40 rounded-xl">
                还没有对话记录
              </div>
            ) : (
              <div className="space-y-0.5">
                {conversations.slice(0, 25).map((c) => (
                  <ConversationItem
                    key={c.id}
                    conversation={c}
                    agentLabel={c.agentId ? (agentNameById.get(c.agentId) || "未知助手") : "通用助手"}
                    active={currentConversationId === c.id}
                    onClick={() => onSelectConversation(c.id)}
                    onDelete={() => onDeleteConversation(c.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
