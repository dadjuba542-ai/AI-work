"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput, FileItem } from "@/components/chat-input";
import { ToolCard } from "@/components/tool-card";
import { AppSidebar } from "@/components/app-sidebar";
import { ModelSwitcher } from "@/components/model-switcher";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, ChevronDown, ChevronRight, X, MessageCircle, WandSparkles, RotateCcw, Copy, Files, Upload, PenSquare, Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Download, Link2, Paintbrush, Table2, Plus, Trash2 } from "lucide-react";
import { SkillGrid } from "@/components/skill-grid";
import { SkillSelector } from "@/components/skill-selector";
import { AgentEditor } from "@/components/agent-editor";
import { ExpertGrid } from "@/app/experts/expert-grid";
import { toast } from "sonner";
import { uid } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  examplePrompts: string[];
  isOfficial: boolean;
  reviewStatus: string;
  createdBy?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
  attachments?: Array<Pick<FileItem, "name" | "kind">>;
  retryFiles?: FileItem[];
}

interface ApiMessage {
  id: string;
  role: string;
  content?: string | null;
}

interface Conversation {
  id: string;
  title: string;
  agentId?: string | null;
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

interface ToolCallEvent {
  id: string;
  name: string;
  input: string;
  output: string;
  ok: boolean;
  durationMs: number;
}

interface Props {
  agents: Agent[];
  models: string[];
  initialAgentId?: string;
  initialViewMode?: "chat" | "skills" | "experts" | "batch" | "copydesk" | "sheetdesk";
}

interface BatchRunItem {
  id: string;
  name: string;
  status: "queued" | "running" | "success" | "failed";
  note?: string;
}

interface CopydeskVersion {
  id: string;
  label: string;
  html: string;
  createdAt: string;
}

interface CopydeskFloatingBarState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
}

type CopydeskContextMode = "off" | "summary" | "full";
type RagMode = "off" | "summary" | "full";
interface CopydeskQaResult {
  duplicatePunct: number;
  longLines: number;
  repeatedWords: number;
}
type SheetOp = "add" | "sub" | "mul" | "div";
interface SheetPlan {
  op: SheetOp;
  colA: string;
  colB: string;
  result: string;
}
interface SheetSelection {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}


const defaultPrompts = [
  "帮我写一段 Python 爬虫代码",
  "分析这份数据并给出可视化建议",
  "把这段中文翻译成地道的英文",
  "帮我梳理这个产品的核心卖点",
];

function TypingIndicator() {
  return (
    <div className="mx-auto flex w-full max-w-4xl items-center gap-1 px-5 py-8">
      <div className="flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card/75 px-4 py-2.5 shadow-sm">
        <span
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-[typing-bounce_1.4s_infinite]"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-[typing-bounce_1.4s_infinite]"
          style={{ animationDelay: "200ms" }}
        />
        <span
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-[typing-bounce_1.4s_infinite]"
          style={{ animationDelay: "400ms" }}
        />
      </div>
    </div>
  );
}

export function UniversalChat({ agents, models, initialAgentId, initialViewMode = "chat" }: Props) {
  const router = useRouter();
  const [currentAgentId, setCurrentAgentId] = useState<string | undefined>(initialAgentId);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThink, setStreamingThink] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolCallEvent[]>([]);
  const [showThink, setShowThink] = useState(true);
  const [model, setModel] = useState(models[0] || "MiniMax-M2.7");

  const [viewMode, setViewMode] = useState<"chat" | "skills" | "experts" | "batch" | "copydesk" | "sheetdesk">(initialViewMode);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [activeSkillNames, setActiveSkillNames] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [copydeskFontFamily, setCopydeskFontFamily] = useState("Microsoft YaHei");
  const [copydeskFontSize, setCopydeskFontSize] = useState("16");
  const [copydeskActionLoading, setCopydeskActionLoading] = useState(false);
  const [copydeskChatDraft, setCopydeskChatDraft] = useState("");
  const [copydeskChatFocusToken, setCopydeskChatFocusToken] = useState(0);
  const [copydeskVersions, setCopydeskVersions] = useState<CopydeskVersion[]>([]);
  const [pendingReplace, setPendingReplace] = useState<{ content: string; selectedText: string } | null>(null);
  const [copydeskContextMode, setCopydeskContextMode] = useState<CopydeskContextMode>("off");
  const [copydeskFormatBrush, setCopydeskFormatBrush] = useState<{ active: boolean; style: string }>({ active: false, style: "" });
  const [lastAiReplaceSnapshot, setLastAiReplaceSnapshot] = useState<string | null>(null);
  const [copydeskQa, setCopydeskQa] = useState<CopydeskQaResult | null>(null);
  const [copydeskFloatingBar, setCopydeskFloatingBar] = useState<CopydeskFloatingBarState>({
    visible: false,
    x: 0,
    y: 0,
    text: "",
  });
  const [batchPrompt, setBatchPrompt] = useState("请总结这个文件并给出关键结论");
  const [sheetHeaders, setSheetHeaders] = useState<string[]>(["A", "B"]);
  const [sheetRows, setSheetRows] = useState<Array<Array<string | number>>>([["", ""]]);
  const [sheetCellColors, setSheetCellColors] = useState<string[][]>([["", ""]]);
  const [sheetSnapshots, setSheetSnapshots] = useState<Array<{ headers: string[]; rows: Array<Array<string | number>>; colors: string[][] }>>([]);
  const [sheetNl, setSheetNl] = useState("");
  const [sheetRunning, setSheetRunning] = useState(false);
  const [sheetSelection, setSheetSelection] = useState<SheetSelection | null>(null);
  const [sheetSelecting, setSheetSelecting] = useState(false);
  const [sheetFilterKeyword, setSheetFilterKeyword] = useState("");
  const [sheetPaintColor, setSheetPaintColor] = useState("#fff3bf");
  const [sheetCalcAction, setSheetCalcAction] = useState<"sum" | "mul" | "sub">("sum");
  const [sheetFormatAction, setSheetFormatAction] = useState<"currency" | "percent" | "fill">("currency");
  const [sheetStructureAction, setSheetStructureAction] = useState<"insertAbove" | "insertBelow" | "insertRight" | "deleteRows" | "clearCells" | "stats">("insertBelow");
  const [globalRagMode, setGlobalRagMode] = useState<RagMode>("off");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchItems, setBatchItems] = useState<BatchRunItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const copydeskEditorRef = useRef<HTMLDivElement>(null);
  const copydeskEditorWrapRef = useRef<HTMLDivElement>(null);
  const copydeskSelectionTimerRef = useRef<number | null>(null);
  const copydeskSelectionRangeRef = useRef<Range | null>(null);
  const copydeskImportInputRef = useRef<HTMLInputElement>(null);
  const sheetImportInputRef = useRef<HTMLInputElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);
  const copydeskSaveTimerRef = useRef<number | null>(null);
  const sheetdeskSaveTimerRef = useRef<number | null>(null);
  const copydeskDraftLoadedRef = useRef(false);
  const sheetdeskDraftLoadedRef = useRef(false);

  const persistCopydeskDraft = useCallback(async () => {
    const editor = copydeskEditorRef.current;
    if (!editor) return;
    const html = editor.innerHTML || "<p><br/></p>";
    const payload = {
      html,
      fontFamily: copydeskFontFamily,
      fontSize: copydeskFontSize,
      versions: copydeskVersions,
      savedAt: Date.now(),
    };
    await fetch("/api/workspace-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceType: "copydesk", agentId: currentAgentId || "", draft: payload }),
    });
  }, [copydeskFontFamily, copydeskFontSize, copydeskVersions, currentAgentId]);

  const persistSheetdeskDraft = useCallback(async () => {
    const payload = {
      headers: sheetHeaders,
      rows: sheetRows,
      colors: sheetCellColors,
      nl: sheetNl,
      savedAt: Date.now(),
    };
    await fetch("/api/workspace-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceType: "sheetdesk", agentId: currentAgentId || "", draft: payload }),
    });
  }, [currentAgentId, sheetCellColors, sheetHeaders, sheetNl, sheetRows]);

  const loadCopydeskDraft = useCallback(async () => {
    const res = await fetch(`/api/workspace-drafts?workspaceType=copydesk&agentId=${encodeURIComponent(currentAgentId || "")}`);
    if (!res.ok) return;
    const data = await res.json() as { draft?: { html?: string; fontFamily?: string; fontSize?: string; versions?: CopydeskVersion[] } | null };
    if (!data.draft) return;
    if (copydeskEditorRef.current && data.draft.html) copydeskEditorRef.current.innerHTML = data.draft.html;
    if (data.draft.fontFamily) setCopydeskFontFamily(data.draft.fontFamily);
    if (data.draft.fontSize) setCopydeskFontSize(data.draft.fontSize);
    if (Array.isArray(data.draft.versions)) setCopydeskVersions(data.draft.versions.slice(0, 20));
  }, [currentAgentId]);

  const loadSheetdeskDraft = useCallback(async () => {
    const res = await fetch(`/api/workspace-drafts?workspaceType=sheetdesk&agentId=${encodeURIComponent(currentAgentId || "")}`);
    if (!res.ok) return;
    const data = await res.json() as { draft?: { headers?: string[]; rows?: Array<Array<string | number>>; colors?: string[][]; nl?: string } | null };
    if (!data.draft) return;
    if (Array.isArray(data.draft.headers) && data.draft.headers.length > 0) setSheetHeaders(data.draft.headers);
    if (Array.isArray(data.draft.rows) && data.draft.rows.length > 0) setSheetRows(data.draft.rows);
    if (Array.isArray(data.draft.colors)) setSheetCellColors(data.draft.colors);
    if (typeof data.draft.nl === "string") setSheetNl(data.draft.nl);
  }, [currentAgentId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  const fetchSkills = useCallback(async () => {
    const res = await fetch("/api/skills");
    if (res.ok) setAllSkills(await res.json());
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, streamingThink, scrollToBottom]);

  // Initial data synchronization for the client chat shell.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (viewMode === "skills") fetchSkills();
  }, [viewMode, fetchSkills]);

  useEffect(() => {
    if (viewMode === "copydesk" && copydeskEditorRef.current && !copydeskEditorRef.current.innerHTML.trim()) {
      copydeskEditorRef.current.innerHTML = "<p><br/></p>";
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === "copydesk" && !copydeskDraftLoadedRef.current) {
      copydeskDraftLoadedRef.current = true;
      queueMicrotask(() => {
        loadCopydeskDraft().catch(() => undefined);
      });
    }
    if (viewMode === "sheetdesk" && !sheetdeskDraftLoadedRef.current) {
      sheetdeskDraftLoadedRef.current = true;
      queueMicrotask(() => {
        loadSheetdeskDraft().catch(() => undefined);
      });
    }
  }, [loadCopydeskDraft, loadSheetdeskDraft, viewMode]);

  useEffect(() => {
    if (viewMode !== "copydesk") return;
    if (copydeskSaveTimerRef.current) window.clearTimeout(copydeskSaveTimerRef.current);
    copydeskSaveTimerRef.current = window.setTimeout(() => {
      persistCopydeskDraft().catch(() => undefined);
      copydeskSaveTimerRef.current = null;
    }, 2000);
  }, [viewMode, persistCopydeskDraft, copydeskFontFamily, copydeskFontSize, copydeskVersions]);

  useEffect(() => {
    if (viewMode !== "sheetdesk") return;
    if (sheetdeskSaveTimerRef.current) window.clearTimeout(sheetdeskSaveTimerRef.current);
    sheetdeskSaveTimerRef.current = window.setTimeout(() => {
      persistSheetdeskDraft().catch(() => undefined);
      sheetdeskSaveTimerRef.current = null;
    }, 2000);
  }, [viewMode, persistSheetdeskDraft, sheetHeaders, sheetRows, sheetCellColors, sheetNl]);

  useEffect(() => {
    return () => {
      if (copydeskSelectionTimerRef.current) {
        window.clearTimeout(copydeskSelectionTimerRef.current);
        copydeskSelectionTimerRef.current = null;
      }
      if (copydeskSaveTimerRef.current) {
        window.clearTimeout(copydeskSaveTimerRef.current);
        copydeskSaveTimerRef.current = null;
      }
      if (sheetdeskSaveTimerRef.current) {
        window.clearTimeout(sheetdeskSaveTimerRef.current);
        sheetdeskSaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (viewMode === "copydesk") persistCopydeskDraft().catch(() => undefined);
      if (viewMode === "sheetdesk") persistSheetdeskDraft().catch(() => undefined);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [persistCopydeskDraft, persistSheetdeskDraft, viewMode]);

  function saveCopydeskSnapshot(label: string) {
    const editor = copydeskEditorRef.current;
    if (!editor) return;
    const html = editor.innerHTML;
    persistCopydeskDraft();
    setCopydeskVersions((prev) => [
      { id: uid(), label, html, createdAt: new Date().toLocaleTimeString() },
      ...prev,
    ].slice(0, 20));
  }

  async function fetchMessages(convId: string) {
    const res = await fetch(`/api/conversations/${convId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(((data.messages || []) as ApiMessage[]).map((m) => ({
        id: m.id, role: m.role === "user" ? "user" : "assistant", content: m.content || "",
      })));
    }
  }

  async function handleToggleFavorite(skillId: string) {
    const res = await fetch("/api/skills/favorite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId }),
    });
    if (res.ok) {
      const { favorited } = await res.json();
      setAllSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, favorited } : s)));
    }
  }

  function handleToggleSkill(skillName: string) {
    setActiveSkillNames((prev) =>
      prev.includes(skillName) ? prev.filter((n) => n !== skillName) : [...prev, skillName]
    );
  }

  async function createConversation(firstMsg: string): Promise<string> {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: currentAgentId || null, title: firstMsg.slice(0, 50) }),
    });
    if (!res.ok) throw new Error("创建对话失败");
    return (await res.json()).id;
  }

  async function handleSend(content: string, files?: FileItem[]): Promise<{ ok: boolean; message?: string; assistantContent?: string }> {
    if (streaming) return { ok: false, message: "当前有任务执行中" };
    let finalMessage = content;
    if (viewMode === "copydesk" && copydeskContextMode !== "off") {
      const fullText = (copydeskEditorRef.current?.innerText || "").trim();
      if (fullText) {
        if (copydeskContextMode === "summary") {
          const maxChars = 2400;
          const compact = fullText.replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ");
          const summary = compact.length > maxChars ? `${compact.slice(0, maxChars)}\n\n[摘要已截断，仅保留前 ${maxChars} 字]` : compact;
          finalMessage = `[编辑器上下文摘要]\n${summary}\n\n[当前需求]\n${content}`;
        } else {
          const maxChars = 12000;
          const ctx = fullText.length > maxChars ? `${fullText.slice(-maxChars)}\n\n[上下文已截断，仅保留末尾 ${maxChars} 字]` : fullText;
          finalMessage = `[编辑器全文上下文]\n${ctx}\n\n[当前需求]\n${content}`;
        }
      }
    }

    let convId = currentConversationId;
    if (!convId) {
      try {
        convId = await createConversation(content);
        setCurrentConversationId(convId);
        fetchConversations();
      } catch {
        toast.error("创建对话失败");
        return { ok: false, message: "创建对话失败" };
      }
    }

    setMessages((prev) => [
      ...prev,
      {
        id: uid(),
        role: "user",
        content: finalMessage,
        attachments: (files || []).map((f) => ({ name: f.name, kind: f.kind })),
        retryFiles: files,
      },
    ]);
    setStreaming(true);
    setStreamingContent("");
    setStreamingThink("");
    setStreamingTools([]);
    setShowThink(true);

    await new Promise((r) => setTimeout(r, 0));

    try {
      const body: {
        agentId?: string;
        conversationId: string;
        message: string;
        files?: FileItem[];
        model: string;
        activeSkills?: string[];
        ragMode?: RagMode;
        ragProductId?: string;
        webSearchEnabled?: boolean;
      } = { agentId: currentAgentId || undefined, conversationId: convId, message: finalMessage, files, model };
      if (activeSkillNames.length > 0) body.activeSkills = activeSkillNames;
      body.ragMode = globalRagMode;
      body.ragProductId = "general";
      body.webSearchEnabled = webSearchEnabled;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      const tools: ToolCallEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "think") setStreamingThink(event.content || "");
            else if (event.type === "tool") { tools.push(event); setStreamingTools([...tools]); }
            else if (event.type === "text") { fullContent = event.content || ""; setStreamingContent(fullContent); }
          } catch {}
        }
      }

      const explain = buildFailureExplanation(tools);
      const finalContent = explain ? `${fullContent}\n\n[失败原因解释]\n${explain}` : fullContent;
      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: finalContent, toolCalls: tools }]);
      setStreamingContent("");
      setStreamingThink("");
      setStreamingTools([]);
      fetchConversations();
      return { ok: true, assistantContent: finalContent };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      toast.error(`发送失败: ${message}`);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `执行失败。\n\n[失败原因解释]\n${buildErrorExplanation(message)}` },
      ]);
      setStreamingContent("");
      return { ok: false, message };
    } finally {
      setStreaming(false);
    }
  }

  function handleNewChat() {
    const fromWorkbench = viewMode === "copydesk" || viewMode === "sheetdesk";
    if (viewMode === "copydesk") persistCopydeskDraft().catch(() => undefined);
    if (viewMode === "sheetdesk") persistSheetdeskDraft().catch(() => undefined);
    setCurrentConversationId(undefined);
    setCurrentAgentId(undefined);
    setMessages([]);
    if (fromWorkbench) {
      toast.success("已跳转主提问页，工作台内容已保留");
    }
    setViewMode("chat");
    router.push("/");
  }

  function clearCopydeskEditor() {
    const editor = copydeskEditorRef.current;
    if (!editor) return;
    saveCopydeskSnapshot("清空前");
    editor.innerHTML = "<p><br/></p>";
    setCopydeskQa(null);
    setPendingReplace(null);
    fetch(`/api/workspace-drafts?workspaceType=copydesk&agentId=${encodeURIComponent(currentAgentId || "")}`, { method: "DELETE" }).catch(() => undefined);
    toast.success("文案编辑器已清空");
  }

  function clearSheetWorkspace() {
    saveSheetSnapshot();
    setSheetHeaders(["A", "B"]);
    setSheetRows([["", ""]]);
    setSheetCellColors([["", ""]]);
    setSheetSelection(null);
    setSheetNl("");
    fetch(`/api/workspace-drafts?workspaceType=sheetdesk&agentId=${encodeURIComponent(currentAgentId || "")}`, { method: "DELETE" }).catch(() => undefined);
    toast.success("表格已清空并重置");
  }

  function handleSelectAgent(id: string) {
    setCurrentAgentId(id);
    setCurrentConversationId(undefined);
    setMessages([]);
    if (viewMode === "copydesk") {
      router.push(`/copydesk?agent=${id}`);
      return;
    }
    if (viewMode === "sheetdesk") {
      router.push(`/sheetdesk?agent=${id}`);
      return;
    }
    setViewMode("chat");
    router.push(`/?agent=${id}`);
  }

  function handleSelectConversation(convId: string) {
    const conv = conversations.find((c) => c.id === convId);
    const nextAgentId = conv?.agentId || undefined;
    setCurrentAgentId(nextAgentId);
    setCurrentConversationId(convId);
    if (viewMode !== "copydesk" && viewMode !== "sheetdesk") setViewMode("chat");
    fetchMessages(convId);
    if (viewMode === "copydesk") {
      if (nextAgentId) router.push(`/copydesk?agent=${nextAgentId}`);
      else router.push("/copydesk");
      return;
    }
    if (viewMode === "sheetdesk") {
      if (nextAgentId) router.push(`/sheetdesk?agent=${nextAgentId}`);
      else router.push("/sheetdesk");
      return;
    }
    if (nextAgentId) router.push(`/?agent=${nextAgentId}`);
    else router.push("/");
  }

  async function handleDeleteConversation(convId: string) {
    if (!confirm("确定删除此对话？")) return;
    const res = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
    if (res.ok) {
      if (currentConversationId === convId) { setCurrentConversationId(undefined); setMessages([]); }
      fetchConversations();
    }
  }

  function handleRetryByAssistantIndex(index: number) {
    if (streaming) return;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (!curr || curr.role !== "assistant") return;
    if (!prev || prev.role !== "user" || !prev.content?.trim()) {
      toast.error("未找到可重试的用户消息");
      return;
    }
    handleSend(prev.content, prev.retryFiles);
  }

  async function handleCopyByAssistantIndex(index: number) {
    const curr = messages[index];
    if (!curr || curr.role !== "assistant") return;
    const text = (curr.content || "").trim();
    if (!text) {
      toast.error("没有可复制的内容");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch {
      toast.error("复制失败");
    }
  }

  function buildFailureExplanation(tools: ToolCallEvent[]): string {
    const failed = tools.filter((t) => !t.ok);
    if (failed.length === 0) return "";
    const first = failed[0];
    return `工具 ${first.name} 执行失败，可能是参数格式不正确、权限受限或外部服务超时。可先检查输入参数，再重试。原始错误：${(first.output || "").slice(0, 180)}`;
  }

  function buildErrorExplanation(message: string): string {
    if (/401|403|无权限|未登录/i.test(message)) return "当前请求缺少权限，请先确认账号权限或重新登录后再试。";
    if (/timeout|超时|No response/i.test(message)) return "请求超时或服务无响应，建议稍后重试，或缩短输入内容。";
    if (/LLM API error|5\d\d/.test(message)) return "模型服务端返回异常，建议重试或切换模型。";
    return `请求失败，可能是网络或工具调用异常。错误信息：${message.slice(0, 180)}`;
  }

  async function handleBatchFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []) as File[];
    if (selected.length === 0 || streaming) return;
    const batchPrompt = window.prompt("输入批量处理指令（会对每个文件执行一次）", "请总结这个文件并给出关键结论");
    if (!batchPrompt?.trim()) {
      e.target.value = "";
      return;
    }

    for (let i = 0; i < selected.length; i++) {
      const f = selected[i];
      const b64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(",")[1]);
        r.readAsDataURL(f);
      });
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const isImage = f.type.startsWith("image/");
      const isOffice = !isImage && ["xlsx", "xls", "docx", "pptx", "pdf"].includes(ext);
      const item: FileItem = {
        name: f.name,
        type: f.type || "application/octet-stream",
        data: b64,
        kind: isImage ? "image" : isOffice ? "office" : "text",
      };
      await handleSend(`${batchPrompt}\n\n[批量处理 ${i + 1}/${selected.length}] 文件：${f.name}`, [item]);
    }
    e.target.value = "";
  }

  function handleSelectSkills() {
    setViewMode(viewMode === "skills" ? "chat" : "skills");
  }

  function handleSelectExperts() {
    setViewMode(viewMode === "experts" ? "chat" : "experts");
  }

  function handleSelectBatch() {
    setViewMode(viewMode === "batch" ? "chat" : "batch");
  }

  function handleSelectCopydesk() {
    setViewMode("copydesk");
    router.push(currentAgentId ? `/copydesk?agent=${currentAgentId}` : "/copydesk");
  }

  function handleSelectSheetdesk() {
    setViewMode("sheetdesk");
    router.push(currentAgentId ? `/sheetdesk?agent=${currentAgentId}` : "/sheetdesk");
  }


  function runEditorCommand(command: string, value?: string) {
    copydeskEditorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function buildStructuredFragment(text: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trimEnd();
      if (!line.trim()) {
        i++;
        continue;
      }
      if (line.startsWith("#")) {
        const level = Math.min(6, line.match(/^#+/)?.[0].length || 1);
        const h = document.createElement(`h${level}`);
        h.textContent = line.replace(/^#+\s*/, "");
        frag.appendChild(h);
        i++;
        continue;
      }
      if (/^[-*]\s+/.test(line)) {
        const ul = document.createElement("ul");
        ul.style.paddingLeft = "1.2rem";
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          const li = document.createElement("li");
          li.textContent = lines[i].trim().replace(/^[-*]\s+/, "");
          ul.appendChild(li);
          i++;
        }
        frag.appendChild(ul);
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        const ol = document.createElement("ol");
        ol.style.paddingLeft = "1.2rem";
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const li = document.createElement("li");
          li.textContent = lines[i].trim().replace(/^\d+\.\s+/, "");
          ol.appendChild(li);
          i++;
        }
        frag.appendChild(ol);
        continue;
      }
      const p = document.createElement("p");
      p.textContent = line;
      frag.appendChild(p);
      i++;
    }
    return frag;
  }

  function getEditorSelectionText(): string {
    const editor = copydeskEditorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return "";
    return sel.toString().trim();
  }

  function hideCopydeskFloatingBar() {
    if (copydeskSelectionTimerRef.current) {
      window.clearTimeout(copydeskSelectionTimerRef.current);
      copydeskSelectionTimerRef.current = null;
    }
    setCopydeskFloatingBar((prev) => ({ ...prev, visible: false }));
  }

  function restoreCopydeskSelectionRange() {
    const editor = copydeskEditorRef.current;
    const saved = copydeskSelectionRangeRef.current;
    if (!editor || !saved) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = saved.cloneRange();
    if (!editor.contains(range.commonAncestorContainer)) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function handleCopydeskSelectionHover() {
    const editor = copydeskEditorRef.current;
    const wrap = copydeskEditorWrapRef.current;
    const sel = window.getSelection();
    if (!editor || !wrap || !sel || sel.rangeCount === 0) {
      hideCopydeskFloatingBar();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer) || sel.isCollapsed) {
      hideCopydeskFloatingBar();
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      hideCopydeskFloatingBar();
      return;
    }
    if (copydeskFormatBrush.active && copydeskFormatBrush.style) {
      try {
        const extracted = range.extractContents();
        const span = document.createElement("span");
        span.setAttribute("style", copydeskFormatBrush.style);
        span.appendChild(extracted);
        range.insertNode(span);
        setCopydeskFormatBrush({ active: false, style: "" });
        toast.success("格式刷已应用");
      } catch {
        toast.error("格式刷应用失败，请重试");
      }
      hideCopydeskFloatingBar();
      return;
    }
    const rect = range.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    copydeskSelectionRangeRef.current = range.cloneRange();
    if (copydeskSelectionTimerRef.current) {
      window.clearTimeout(copydeskSelectionTimerRef.current);
    }
    copydeskSelectionTimerRef.current = window.setTimeout(() => {
      setCopydeskFloatingBar({
        visible: true,
        x: rect.left - wrapRect.left,
        y: rect.top - wrapRect.top - 34,
        text,
      });
    }, 1000);
  }

  function insertAssistantToEditor(content: string, mode: "cursor" | "replace" | "append") {
    const editor = copydeskEditorRef.current;
    if (!editor) return;
    editor.focus();
    saveCopydeskSnapshot(`AI写入前-${mode}`);
    if (mode === "replace") setLastAiReplaceSnapshot(editor.innerHTML);

    const sel = window.getSelection();
    const hasRange = !!sel && sel.rangeCount > 0;
    const range = hasRange ? sel!.getRangeAt(0) : null;
    const inEditor = !!range && editor.contains(range.commonAncestorContainer);
    const fragment = buildStructuredFragment(content);

    if (mode === "append" || !inEditor) {
      editor.appendChild(fragment);
      toast.success(mode === "append" ? "已追加到末尾" : "光标不在编辑区，已追加到末尾");
      return;
    }

    if (mode === "replace") {
      range!.deleteContents();
    }

    range!.insertNode(fragment);
    range!.collapse(false);
    range!.collapse(true);
    sel!.removeAllRanges();
    sel!.addRange(range!);
    toast.success(mode === "replace" ? "已替换选中文本" : "已插入到光标处");
  }

  function beginReplacePreview(content: string) {
    restoreCopydeskSelectionRange();
    const selected = getEditorSelectionText();
    if (!selected) {
      toast.error("请先在编辑区选中文本，再点替换选中");
      return;
    }
    setPendingReplace({ content, selectedText: selected });
  }

  function applyPendingReplace() {
    if (!pendingReplace) return;
    insertAssistantToEditor(pendingReplace.content, "replace");
    setPendingReplace(null);
  }

  async function handleCopydeskAction(action: "expand" | "shorten" | "formal" | "headline" | "continue") {
    const selected = getEditorSelectionText();
    if (!selected) {
      toast.error("请先在文案编辑板选中文本");
      return;
    }
    const promptByAction: Record<typeof action, string> = {
      expand: `请扩写这段文案，保持原意并增强细节与说服力：\n\n${selected}`,
      shorten: `请精简这段文案，保留核心信息并提升可读性：\n\n${selected}`,
      formal: `请把这段文案改成更专业、正式但自然的语气：\n\n${selected}`,
      headline: `请基于这段内容给出 10 个可直接使用的标题：\n\n${selected}`,
      continue: `请沿着这段文案的逻辑继续写下一段，风格保持一致：\n\n${selected}`,
    };
    setCopydeskActionLoading(true);
    try {
      await handleSend(promptByAction[action]);
    } finally {
      setCopydeskActionLoading(false);
    }
  }

  async function handleFloatingSelectionAutoReplace(action: "rewrite" | "shorten" | "expand", sourceText?: string) {
    restoreCopydeskSelectionRange();
    const selected = (sourceText || getEditorSelectionText()).trim();
    if (!selected) {
      toast.error("请先在文案编辑板选中文本");
      return;
    }
    const promptMap: Record<typeof action, string> = {
      rewrite: `请改写这段文案，保持核心意思不变，并提升流畅度与表达质量：\n\n${selected}`,
      shorten: `请精简这段文案，保留关键信息，语句更紧凑：\n\n${selected}`,
      expand: `请扩写这段文案，补充细节与说服力，保持原有主题：\n\n${selected}`,
    };
    setCopydeskActionLoading(true);
    try {
      toast.loading("AI 正在处理中...", { id: "copydesk-floating-action" });
      const result = await handleSend(promptMap[action]);
      if (result.ok && result.assistantContent?.trim()) {
        restoreCopydeskSelectionRange();
        insertAssistantToEditor(result.assistantContent, "replace");
        toast.success("已完成替换", { id: "copydesk-floating-action" });
      } else {
        toast.error(result.message || "AI 未返回可替换内容", { id: "copydesk-floating-action" });
      }
    } catch {
      toast.error("执行失败，请重试", { id: "copydesk-floating-action" });
    } finally {
      setCopydeskActionLoading(false);
    }
  }

  function handleInsertSelectionToChatInput() {
    restoreCopydeskSelectionRange();
    const selected = getEditorSelectionText();
    if (!selected) {
      toast.error("请先在文案编辑板选中文本");
      return;
    }
    setCopydeskChatDraft((prev) => (prev.trim() ? `${prev}\n\n选中文案：\n${selected}` : `选中文案：\n${selected}`));
    setCopydeskChatFocusToken((v) => v + 1);
    toast.success("已填入聊天输入框，可继续补充要求后发送");
  }

  function putTextToChatInput(text: string) {
    const payload = text.trim();
    if (!payload) return;
    setCopydeskChatDraft((prev) => (prev.trim() ? `${prev}\n\n选中文案：\n${payload}` : `选中文案：\n${payload}`));
    setCopydeskChatFocusToken((v) => v + 1);
  }

  function handleDropTextToChat(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain");
    if (!text?.trim()) return;
    putTextToChatInput(text);
    toast.success("已将拖拽文本填入聊天输入框");
  }

  function activateFormatBrush() {
    const editor = copydeskEditorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
      toast.error("请先选中一段带格式文本");
      return;
    }
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      toast.error("请在编辑区内选中源格式文本");
      return;
    }
    const el = (range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement) as HTMLElement | null;
    if (!el) {
      toast.error("未读取到源格式");
      return;
    }
    const cs = window.getComputedStyle(el);
    const style = [
      `font-family:${cs.fontFamily}`,
      `font-size:${cs.fontSize}`,
      `font-weight:${cs.fontWeight}`,
      `font-style:${cs.fontStyle}`,
      `text-decoration:${cs.textDecorationLine}`,
      `color:${cs.color}`,
      `background-color:${cs.backgroundColor}`,
      `line-height:${cs.lineHeight}`,
      `letter-spacing:${cs.letterSpacing}`,
    ].join(";");
    setCopydeskFormatBrush({ active: true, style });
    toast.success("格式刷已激活：请选中目标文本");
  }

  async function handleImportDocx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("仅支持导入 .docx 文件");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/copydesk/import-docx", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "导入失败");
      return;
    }
    const data = await res.json();
    if (copydeskEditorRef.current) {
      copydeskEditorRef.current.innerHTML = data.html || "<p><br/></p>";
      toast.success("Word 已导入到编辑器");
    }
  }

  async function handleExportDocx() {
    const html = copydeskEditorRef.current?.innerHTML?.trim() || "";
    if (!html || html === "<p><br></p>" || html === "<p><br/></p>") {
      toast.error("编辑器为空，无法导出");
      return;
    }
    const res = await fetch("/api/copydesk/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, filename: "copydesk-export" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "导出失败");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "copydesk-export.docx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Word 已导出");
  }

  async function handleImportFromLark() {
    const doc = window.prompt("请输入飞书文档链接或 doc token");
    if (!doc) return;
    const res = await fetch("/api/integrations/lark/copydesk/import-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "飞书导入失败");
      return;
    }
    if (copydeskEditorRef.current) {
      copydeskEditorRef.current.innerHTML = data.html || "<p><br/></p>";
      persistCopydeskDraft().catch(() => undefined);
    }
    toast.success("已从飞书导入");
  }

  async function handleExportToLark() {
    const html = copydeskEditorRef.current?.innerHTML?.trim() || "";
    if (!html || html === "<p><br></p>" || html === "<p><br/></p>") {
      toast.error("编辑器为空，无法导出");
      return;
    }
    const title = window.prompt("飞书文档标题", "AI Work 文案导出") || "AI Work 文案导出";
    const res = await fetch("/api/integrations/lark/copydesk/export-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "飞书导出失败");
      return;
    }
    if (data.url) window.open(data.url, "_blank");
    toast.success("已导出到飞书文档");
  }

  async function handleSendToLark() {
    const text = (copydeskEditorRef.current?.innerText || "").trim();
    if (!text) {
      toast.error("编辑器为空，无法发送");
      return;
    }
    const receiveId = window.prompt("请输入接收 ID（chat_id / open_id / user_id）");
    if (!receiveId) return;
    const receiveIdType = (window.prompt("接收 ID 类型：chat_id / open_id / user_id", "chat_id") || "chat_id") as "chat_id" | "open_id" | "user_id";

    const res = await fetch("/api/integrations/lark/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiveId, receiveIdType, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "飞书发送失败");
      return;
    }
    toast.success("已发送到飞书");
  }

  function saveSheetSnapshot() {
    setSheetSnapshots((prev) => [
      { headers: [...sheetHeaders], rows: sheetRows.map((r) => [...r]), colors: sheetCellColors.map((r) => [...r]) },
      ...prev,
    ].slice(0, 30));
  }

  function restoreLastSheetSnapshot() {
    if (sheetSnapshots.length === 0) {
      toast.error("没有可回退的快照");
      return;
    }
    const snap = sheetSnapshots[0];
    setSheetHeaders([...snap.headers]);
    setSheetRows(snap.rows.map((r) => [...r]));
    setSheetCellColors((snap.colors || snap.rows.map((r) => r.map(() => ""))).map((r) => [...r]));
    setSheetSnapshots((prev) => prev.slice(1));
    toast.success("已回退到上一步");
  }

  async function handleImportSheet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/sheetdesk/import", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "导入失败");
      return;
    }
    setSheetHeaders((data.headers || []).map((x: unknown) => String(x)));
    const importedRows = (data.rows || []).map((r: unknown[]) => r.map((c) => (c ?? "") as string | number));
    setSheetRows(importedRows);
    setSheetCellColors(importedRows.map((r: Array<string | number>) => r.map(() => "")));
    setSheetSnapshots([]);
    toast.success("表格已导入");
  }

  async function handleExportSheet(format: "xlsx" | "csv" = "xlsx") {
    const res = await fetch("/api/sheetdesk/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headers: sheetHeaders, rows: sheetRows, format }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "导出失败");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sheetdesk-export.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("已导出");
  }

  function parseNumber(v: string | number): number | null {
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : null;
  }

  function normalizeSelection(sel: SheetSelection): SheetSelection {
    return {
      r1: Math.min(sel.r1, sel.r2),
      c1: Math.min(sel.c1, sel.c2),
      r2: Math.max(sel.r1, sel.r2),
      c2: Math.max(sel.c1, sel.c2),
    };
  }

  function isCellInSelection(r: number, c: number): boolean {
    if (!sheetSelection) return false;
    const s = normalizeSelection(sheetSelection);
    return r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2;
  }

  function startSheetSelection(r: number, c: number) {
    setSheetSelection({ r1: r, c1: c, r2: r, c2: c });
    setSheetSelecting(true);
  }

  function updateSheetSelection(r: number, c: number) {
    if (!sheetSelecting || !sheetSelection) return;
    setSheetSelection({ ...sheetSelection, r2: r, c2: c });
  }

  function endSheetSelection() {
    setSheetSelecting(false);
  }

  function selectWholeColumn(c: number) {
    if (sheetRows.length === 0) return;
    setSheetSelection({ r1: 0, c1: c, r2: sheetRows.length - 1, c2: c });
  }

  function getPrimarySelectedColumn(): number | null {
    if (!sheetSelection) return null;
    const s = normalizeSelection(sheetSelection);
    return s.c1 === s.c2 ? s.c1 : null;
  }

  function deleteSelectedSheetRows() {
    if (!sheetSelection) {
      toast.error("请先框选需要删除的行区域");
      return;
    }
    const s = normalizeSelection(sheetSelection);
    const selectedRowIndexes = new Set(Array.from({ length: s.r2 - s.r1 + 1 }, (_, i) => s.r1 + i));
    saveSheetSnapshot();
    setSheetRows((prev) => prev.filter((_, idx) => !selectedRowIndexes.has(idx)));
    setSheetCellColors((prev) => prev.filter((_, idx) => !selectedRowIndexes.has(idx)));
    toast.success(`已删除 ${selectedRowIndexes.size} 行`);
  }

  function clearSelectedSheetCells() {
    if (!sheetSelection) {
      toast.error("请先框选单元格");
      return;
    }
    saveSheetSnapshot();
    const next = sheetRows.map((r) => [...r]);
    const s = normalizeSelection(sheetSelection);
    for (let r = s.r1; r <= s.r2; r++) {
      if (!next[r]) continue;
      for (let c = s.c1; c <= s.c2; c++) next[r][c] = "";
    }
    setSheetRows(next);
    toast.success("已清空选中单元格");
  }

  function paintSelectedSheetCells(color: string) {
    if (!sheetSelection) {
      toast.error("请先框选单元格");
      return;
    }
    saveSheetSnapshot();
    const next = sheetCellColors.map((r) => [...r]);
    const s = normalizeSelection(sheetSelection);
    for (let r = s.r1; r <= s.r2; r++) {
      if (!next[r]) continue;
      for (let c = s.c1; c <= s.c2; c++) next[r][c] = color;
    }
    setSheetCellColors(next);
    toast.success(color ? "已给选区染色" : "已清除选区颜色");
  }

  function fillSelectedSheetCells() {
    if (!sheetSelection) {
      toast.error("请先框选单元格");
      return;
    }
    const value = window.prompt("填充值");
    if (value === null) return;
    saveSheetSnapshot();
    const next = sheetRows.map((r) => [...r]);
    const s = normalizeSelection(sheetSelection);
    for (let r = s.r1; r <= s.r2; r++) {
      if (!next[r]) continue;
      for (let c = s.c1; c <= s.c2; c++) next[r][c] = value;
    }
    setSheetRows(next);
    toast.success("已批量填充");
  }

  function sortSheetBySelectedColumn(order: "asc" | "desc") {
    const col = getPrimarySelectedColumn();
    if (col === null) {
      toast.error("请先选中单列再排序");
      return;
    }
    saveSheetSnapshot();
    const paired = sheetRows.map((row, i) => ({ row, colors: sheetCellColors[i] || sheetHeaders.map(() => "") }));
    const nextPaired = [...paired].sort((a, b) => {
      const av = a.row[col];
      const bv = b.row[col];
      const an = parseNumber(av);
      const bn = parseNumber(bv);
      if (an !== null && bn !== null) return order === "asc" ? an - bn : bn - an;
      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return order === "asc" ? as.localeCompare(bs, "zh-Hans-CN") : bs.localeCompare(as, "zh-Hans-CN");
    });
    setSheetRows(nextPaired.map((x) => x.row));
    setSheetCellColors(nextPaired.map((x) => x.colors));
    toast.success(order === "asc" ? "已按该列升序" : "已按该列降序");
  }

  function filterSheetBySelectedColumn() {
    const col = getPrimarySelectedColumn();
    if (col === null) {
      toast.error("请先选中单列再筛选");
      return;
    }
    const keyword = sheetFilterKeyword.trim();
    if (!keyword) {
      toast.error("请输入筛选关键词");
      return;
    }
    saveSheetSnapshot();
    const paired = sheetRows.map((row, i) => ({ row, colors: sheetCellColors[i] || sheetHeaders.map(() => "") }));
    const nextPaired = paired.filter((x) => String(x.row[col] ?? "").includes(keyword));
    setSheetRows(nextPaired.map((x) => x.row));
    setSheetCellColors(nextPaired.map((x) => x.colors));
    toast.success(`筛选完成，保留 ${nextPaired.length} 行`);
  }

  function formatSelectedAsNumber(kind: "currency" | "percent") {
    if (!sheetSelection) {
      toast.error("请先框选单元格");
      return;
    }
    saveSheetSnapshot();
    const s = normalizeSelection(sheetSelection);
    const next = sheetRows.map((r) => [...r]);
    for (let r = s.r1; r <= s.r2; r++) {
      if (!next[r]) continue;
      for (let c = s.c1; c <= s.c2; c++) {
        const n = parseNumber(next[r][c]);
        if (n === null) continue;
        if (kind === "currency") next[r][c] = `¥${n.toFixed(2)}`;
        else next[r][c] = `${(n * 100).toFixed(2)}%`;
      }
    }
    setSheetRows(next);
    toast.success(kind === "currency" ? "已格式化为金额" : "已格式化为百分比");
  }

  function insertRowBySelection(position: "above" | "below") {
    const rowIndex = sheetSelection ? normalizeSelection(sheetSelection).r1 : sheetRows.length - 1;
    const insertAt = position === "above" ? Math.max(rowIndex, 0) : Math.max(rowIndex + 1, 0);
    saveSheetSnapshot();
    const emptyRow = sheetHeaders.map(() => "");
    setSheetRows((prev) => [...prev.slice(0, insertAt), emptyRow, ...prev.slice(insertAt)]);
    setSheetCellColors((prev) => [...prev.slice(0, insertAt), sheetHeaders.map(() => ""), ...prev.slice(insertAt)]);
    toast.success(position === "above" ? "已插入上方行" : "已插入下方行");
  }

  function insertColumnRightBySelection() {
    const col = getPrimarySelectedColumn();
    const insertAt = col === null ? sheetHeaders.length : col + 1;
    saveSheetSnapshot();
    setSheetHeaders((prev) => [...prev.slice(0, insertAt), `列${prev.length + 1}`, ...prev.slice(insertAt)]);
    setSheetRows((prev) => prev.map((row) => [...row.slice(0, insertAt), "", ...row.slice(insertAt)]));
    setSheetCellColors((prev) => prev.map((row) => [...row.slice(0, insertAt), "", ...row.slice(insertAt)]));
    toast.success("已在右侧插入列");
  }

  function summarizeSelectedRange() {
    if (!sheetSelection) {
      toast.error("请先框选单元格");
      return;
    }
    const s = normalizeSelection(sheetSelection);
    const nums: number[] = [];
    for (let r = s.r1; r <= s.r2; r++) {
      for (let c = s.c1; c <= s.c2; c++) {
        const n = parseNumber(sheetRows[r]?.[c] ?? "");
        if (n !== null) nums.push(n);
      }
    }
    if (nums.length === 0) {
      toast.error("选区内没有可计算数字");
      return;
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    toast.success(`统计：数量 ${nums.length}，求和 ${sum.toFixed(2)}，均值 ${avg.toFixed(2)}`);
  }

  function executeSheetPlan(plan: SheetPlan) {
    const idxA = sheetHeaders.indexOf(plan.colA);
    const idxB = sheetHeaders.indexOf(plan.colB);
    if (idxA < 0 || idxB < 0) {
      toast.error("计划中的列名不存在");
      return;
    }
    saveSheetSnapshot();
    const nextHeaders = [...sheetHeaders, plan.result];
    const nextRows = sheetRows.map((row) => {
      const a = parseNumber(row[idxA]);
      const b = parseNumber(row[idxB]);
      if (a === null || b === null) return [...row, ""];
      let v = "";
      if (plan.op === "add") v = String(a + b);
      else if (plan.op === "sub") v = String(a - b);
      else if (plan.op === "mul") v = String(a * b);
      else v = b === 0 ? "" : String(a / b);
      return [...row, v];
    });
    setSheetHeaders(nextHeaders);
    setSheetRows(nextRows);
    setSheetCellColors((prev) => prev.map((row) => [...row, ""]));
    toast.success(`已执行：${plan.result}`);
  }

  function runSheetCalcAction() {
    if (sheetCalcAction === "sum") executeSheetPlan({ op: "add", colA: sheetHeaders[0] || "", colB: sheetHeaders[1] || "", result: "求和结果" });
    else if (sheetCalcAction === "mul") executeSheetPlan({ op: "mul", colA: sheetHeaders[0] || "", colB: sheetHeaders[1] || "", result: "相乘结果" });
    else executeSheetPlan({ op: "sub", colA: sheetHeaders[0] || "", colB: sheetHeaders[1] || "", result: "相减结果" });
  }

  function runSheetFormatAction() {
    if (sheetFormatAction === "currency") formatSelectedAsNumber("currency");
    else if (sheetFormatAction === "percent") formatSelectedAsNumber("percent");
    else fillSelectedSheetCells();
  }

  function runSheetStructureAction() {
    if (sheetStructureAction === "insertAbove") insertRowBySelection("above");
    else if (sheetStructureAction === "insertBelow") insertRowBySelection("below");
    else if (sheetStructureAction === "insertRight") insertColumnRightBySelection();
    else if (sheetStructureAction === "deleteRows") deleteSelectedSheetRows();
    else if (sheetStructureAction === "clearCells") clearSelectedSheetCells();
    else summarizeSelectedRange();
  }

  async function handleSheetAiPlanAndRun() {
    if (!sheetNl.trim()) {
      toast.error("请输入计算需求");
      return;
    }
    setSheetRunning(true);
    try {
      const prompt = `你是表格计算意图解析器。只返回 JSON，不要解释。\n可用列：${sheetHeaders.join(", ")}\n用户需求：${sheetNl}\n输出格式：{"op":"add|sub|mul|div","colA":"列名","colB":"列名","result":"新列名"}`;
      const ret = await handleSend(prompt);
      const text = ret.assistantContent || "";
      const json = text.match(/\{[\s\S]*\}/)?.[0];
      if (!json) {
        toast.error("AI 未返回可执行计划");
        return;
      }
      const plan = JSON.parse(json) as SheetPlan;
      if (!plan.op || !plan.colA || !plan.colB || !plan.result) {
        toast.error("计划字段不完整");
        return;
      }
      executeSheetPlan(plan);
      const explainPrompt = `已执行表格计算计划：${JSON.stringify(plan)}。请用简短中文解释计算口径、可能的空值/异常风险（3点内）。`;
      await handleSend(explainPrompt);
    } catch {
      toast.error("AI解析失败，请调整描述后重试");
    } finally {
      setSheetRunning(false);
    }
  }

  function runCopydeskQa(text: string): CopydeskQaResult {
    const duplicatePunct = (text.match(/[，。！？,.!?]{2,}/g) || []).length;
    const longLines = text.split("\n").filter((line) => line.trim().length > 120).length;
    const repeatedWords = (text.match(/(\S{2,})\1{1,}/g) || []).length;
    return { duplicatePunct, longLines, repeatedWords };
  }

  function handleUndoLastAiReplace() {
    const editor = copydeskEditorRef.current;
    if (!editor || !lastAiReplaceSnapshot) {
      toast.error("没有可撤销的 AI 替换");
      return;
    }
    editor.innerHTML = lastAiReplaceSnapshot;
    setLastAiReplaceSnapshot(null);
    toast.success("已撤销上一次 AI 替换");
  }

  function applyCopydeskQaFixes() {
    const editor = copydeskEditorRef.current;
    if (!editor) return;
    saveCopydeskSnapshot("质检修复前");
    const fixed = (editor.innerText || "")
      .replace(/([，。！？,.!?])\1+/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");
    editor.innerHTML = fixed
      .split("\n")
      .map((line) => `<p>${line || "<br/>"}</p>`)
      .join("");
    setCopydeskQa(runCopydeskQa(editor.innerText || ""));
    toast.success("已应用基础修复");
  }


  function handleOpenCreateAgent() {
    setEditorOpen(true);
  }

  async function handleAgentSaved() {
    const res = await fetch("/api/agents");
    if (res.ok) {
      // We can't update the prop directly, so we'll reload the page
      window.location.reload();
    }
  }

  const currentAgent = currentAgentId ? agents.find((a) => a.id === currentAgentId) : null;
  const agentPrompts = currentAgent?.examplePrompts?.length ? currentAgent.examplePrompts : defaultPrompts;
  const favoritedSkills = allSkills.filter((s) => s.favorited);

  async function fileToItem(file: File): Promise<FileItem> {
    const b64 = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string).split(",")[1]);
      r.readAsDataURL(file);
    });
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isImage = file.type.startsWith("image/");
    const isOffice = !isImage && ["xlsx", "xls", "docx", "pptx", "pdf"].includes(ext);
    return {
      name: file.name,
      type: file.type || "application/octet-stream",
      data: b64,
      kind: isImage ? "image" : isOffice ? "office" : "text",
    };
  }

  async function runBatchProcessing() {
    if (batchRunning || streaming) return;
    if (batchFiles.length === 0) {
      toast.error("请先选择文件");
      return;
    }
    if (!batchPrompt.trim()) {
      toast.error("请输入批量处理指令");
      return;
    }
    const initItems: BatchRunItem[] = batchFiles.map((f) => ({ id: uid(), name: f.name, status: "queued" }));
    setBatchItems(initItems);
    setBatchRunning(true);
    for (let i = 0; i < batchFiles.length; i++) {
      const f = batchFiles[i];
      setBatchItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: "running", note: "执行中..." } : it)));
      try {
        const item = await fileToItem(f);
        const result = await handleSend(`${batchPrompt}\n\n[批量处理 ${i + 1}/${batchFiles.length}] 文件：${f.name}`, [item]);
        if (result.ok) {
          setBatchItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: "success", note: "处理成功" } : it)));
        } else {
          setBatchItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: "failed", note: result.message || "执行失败" } : it)));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "执行失败";
        setBatchItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: "failed", note: message } : it)));
      }
    }
    setBatchRunning(false);
    fetchConversations();
    toast.success("批量处理已完成");
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <AppSidebar
        agents={agents}
        conversations={conversations}
        currentAgentId={currentAgentId}
        currentConversationId={currentConversationId}
        onNewChat={handleNewChat}
        onSelectAgent={handleSelectAgent}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onSearch={() => {}}
        onSelectSkills={handleSelectSkills}
        onSelectExperts={handleSelectExperts}
        onSelectBatch={handleSelectBatch}
        onSelectCopydesk={handleSelectCopydesk}
        onSelectSheetdesk={handleSelectSheetdesk}
        showSkills={viewMode === "skills"}
        showExperts={viewMode === "experts"}
        showBatch={viewMode === "batch"}
        showCopydesk={viewMode === "copydesk"}
        showSheetdesk={viewMode === "sheetdesk"}
        onCreateAgent={handleOpenCreateAgent}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-2xl border border-border/70 bg-card/72 px-4 py-3 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {viewMode === "skills" ? (
              <>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f7f3]">
                  <Sparkles className="h-4 w-4 text-[#16a085]" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">技能市场</h2>
                  <p className="text-[11px] text-muted-foreground">收藏常用技能，组合到对话里</p>
                </div>
              </>
            ) : viewMode === "experts" ? (
              <>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f0ff]">
                  <Sparkles className="h-4 w-4 text-[#3678ff]" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">专家广场</h2>
                  <p className="text-[11px] text-muted-foreground">选择专业助手，开启针对性对话</p>
                </div>
              </>
            ) : viewMode === "batch" ? (
              <>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef2ff]">
                  <Files className="h-4 w-4 text-[#5b7cfa]" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">批量处理</h2>
                  <p className="text-[11px] text-muted-foreground">批量上传并逐个执行统一指令</p>
                </div>
              </>
            ) : viewMode === "copydesk" ? (
              <>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f3ecff]">
                  <PenSquare className="h-4 w-4 text-[#7b61ff]" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">文案工作台</h2>
                  <p className="text-[11px] text-muted-foreground">完整编辑器 + 右侧 AI 发送入口</p>
                </div>
              </>
            ) : viewMode === "sheetdesk" ? (
              <>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#e8f7ef]">
                  <Table2 className="h-4 w-4 text-[#2f9e44]" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">表格工作台</h2>
                  <p className="text-[11px] text-muted-foreground">LLM解析需求 + 确定性计算执行</p>
                </div>
              </>
            ) : (
              <>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">
                    {currentAgent ? currentAgent.name : "通用助手"}
                  </h2>
                  {currentAgent && (
                    <p className="text-[11px] text-muted-foreground truncate">{currentAgent.category}</p>
                  )}
                </div>
              </>
            )}
          </div>
          {viewMode === "chat" && <ModelSwitcher models={models} current={model} onChange={setModel} />}
        </div>

        {/* Content */}
        {viewMode === "skills" ? (
          <div className="flex-1 overflow-auto px-2 pb-2 pt-2">
            <SkillGrid skills={allSkills} onToggleFavorite={handleToggleFavorite} />
          </div>
        ) : viewMode === "experts" ? (
          <div className="flex-1 overflow-auto px-3 pb-3 pt-3">
            <ExpertGrid agents={agents} embedded onSelectAgent={handleSelectAgent} />
          </div>
        ) : viewMode === "sheetdesk" ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 px-3 pb-3 pt-3">
            <div className="min-h-0 rounded-2xl border border-border/70 bg-card/70 p-4 flex flex-col">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <input ref={sheetImportInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportSheet} />
                <button onClick={() => sheetImportInputRef.current?.click()} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground"><Upload className="inline mr-1 h-3 w-3" />导入表格</button>
                <button onClick={() => handleExportSheet("xlsx")} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground"><Download className="inline mr-1 h-3 w-3" />导出xlsx</button>
                <button onClick={() => handleExportSheet("csv")} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">导出csv</button>
                <button onClick={restoreLastSheetSnapshot} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">撤销上一步</button>
                <button onClick={clearSheetWorkspace} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">清空表格</button>
                <button onClick={deleteSelectedSheetRows} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">删选中行</button>
                <button onClick={clearSelectedSheetCells} className="rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">清空选中</button>
                <button onClick={() => { saveSheetSnapshot(); setSheetHeaders((h) => [...h, `列${h.length + 1}`]); setSheetRows((rows) => rows.map((r) => [...r, ""])); setSheetCellColors((rows) => rows.map((r) => [...r, ""])); }} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground"><Plus className="inline h-3 w-3" />列</button>
                <button onClick={() => { saveSheetSnapshot(); setSheetRows((r) => [...r, sheetHeaders.map(() => "")]); setSheetCellColors((r) => [...r, sheetHeaders.map(() => "")]); }} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground"><Plus className="inline h-3 w-3" />行</button>
              </div>

              <div className="mb-2 rounded-xl border border-border/60 bg-background/65 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input value={sheetNl} onChange={(e) => setSheetNl(e.target.value)} placeholder="例如：用 收入 减 成本，结果列叫 利润" className="h-8 min-w-[260px] flex-1 rounded-md border border-border/70 bg-card/70 px-2 text-xs" />
                  <button onClick={handleSheetAiPlanAndRun} disabled={sheetRunning || streaming} className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary disabled:opacity-50">{sheetRunning ? "执行中..." : "AI解析并执行"}</button>
                  <select value={sheetCalcAction} onChange={(e) => setSheetCalcAction(e.target.value as "sum" | "mul" | "sub")} className="h-7 rounded-md border border-border/70 bg-card/70 px-2 text-xs">
                    <option value="sum">计算: 求和</option>
                    <option value="mul">计算: 相乘</option>
                    <option value="sub">计算: 相减</option>
                  </select>
                  <button onClick={runSheetCalcAction} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">执行计算</button>
                  <button onClick={() => sortSheetBySelectedColumn("asc")} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">升序</button>
                  <button onClick={() => sortSheetBySelectedColumn("desc")} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">降序</button>
                  <input value={sheetFilterKeyword} onChange={(e) => setSheetFilterKeyword(e.target.value)} placeholder="筛选关键词" className="h-7 w-28 rounded-md border border-border/70 bg-card/70 px-2 text-xs" />
                  <button onClick={filterSheetBySelectedColumn} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">筛选</button>
                  <select value={sheetFormatAction} onChange={(e) => setSheetFormatAction(e.target.value as "currency" | "percent" | "fill")} className="h-7 rounded-md border border-border/70 bg-card/70 px-2 text-xs">
                    <option value="currency">格式: 金额</option>
                    <option value="percent">格式: 百分比</option>
                    <option value="fill">格式: 批量填充</option>
                  </select>
                  <button onClick={runSheetFormatAction} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">执行格式</button>
                  <input type="color" value={sheetPaintColor} onChange={(e) => setSheetPaintColor(e.target.value)} className="h-7 w-9 rounded border border-border/70 bg-card/70 p-0.5" />
                  <button onClick={() => paintSelectedSheetCells(sheetPaintColor)} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">染色</button>
                  <button onClick={() => paintSelectedSheetCells("")} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">清色</button>
                  <select value={sheetStructureAction} onChange={(e) => setSheetStructureAction(e.target.value as "insertAbove" | "insertBelow" | "insertRight" | "deleteRows" | "clearCells" | "stats")} className="h-7 rounded-md border border-border/70 bg-card/70 px-2 text-xs">
                    <option value="insertBelow">结构: 插下行</option>
                    <option value="insertAbove">结构: 插上行</option>
                    <option value="insertRight">结构: 插右列</option>
                    <option value="deleteRows">结构: 删选中行</option>
                    <option value="clearCells">结构: 清空选中</option>
                    <option value="stats">结构: 选区统计</option>
                  </select>
                  <button onClick={runSheetStructureAction} className="rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground">执行结构</button>
                </div>
              </div>

              <div
                className="flex-1 min-h-0 overflow-auto rounded-xl border border-border/60 bg-background/60"
                onMouseUp={endSheetSelection}
                onMouseLeave={endSheetSelection}
              >
                <table className="min-w-full text-xs select-none">
                  <thead>
                    <tr className="bg-card/80">
                      {sheetHeaders.map((h, i) => (
                        <th key={`${h}-${i}`} className="border-b border-r border-border/60 p-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              value={h}
                              onClick={() => selectWholeColumn(i)}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSheetHeaders((prev) => prev.map((x, idx) => (idx === i ? v : x)));
                              }}
                              className="w-full rounded border border-border/50 bg-background px-1 py-0.5"
                            />
                            <button
                              onClick={() => {
                                if (sheetHeaders.length <= 1) return;
                                saveSheetSnapshot();
                                setSheetHeaders((prev) => prev.filter((_, idx) => idx !== i));
                                setSheetRows((prev) => prev.map((r) => r.filter((_, idx) => idx !== i)));
                                setSheetCellColors((prev) => prev.map((r) => r.filter((_, idx) => idx !== i)));
                              }}
                              className="rounded border border-border/60 p-0.5 text-muted-foreground"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetRows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {sheetHeaders.map((_, cIdx) => (
                          <td
                            key={`${rIdx}-${cIdx}`}
                            className={`border-b border-r border-border/60 p-1 ${isCellInSelection(rIdx, cIdx) ? "bg-primary/10" : ""}`}
                            style={!isCellInSelection(rIdx, cIdx) && sheetCellColors[rIdx]?.[cIdx] ? { backgroundColor: sheetCellColors[rIdx][cIdx] } : undefined}
                            onMouseDown={() => startSheetSelection(rIdx, cIdx)}
                            onMouseEnter={() => updateSheetSelection(rIdx, cIdx)}
                          >
                            <input
                              value={String(row[cIdx] ?? "")}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSheetRows((prev) => prev.map((rr, i) => (i === rIdx ? rr.map((cell, j) => (j === cIdx ? v : cell)) : rr)));
                              }}
                              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 focus:border-border/70 focus:bg-background"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="min-h-0 rounded-2xl border border-border/70 bg-card/70 p-3 flex flex-col">
              <p className="text-sm font-semibold">AI 子菜单栏</p>
              <p className="mt-1 text-xs text-muted-foreground">用于展示计划解释与风险提示。</p>
              <div className="mt-2 flex-1 min-h-0 overflow-auto rounded-xl border border-border/60 bg-background/55 p-2 space-y-2">
                {messages.slice(-8).map((m) => (
                  <div key={m.id} className="rounded-lg border border-border/60 bg-card/70 px-2 py-1.5">
                    <p className="mb-1 text-[10px] text-muted-foreground">{m.role === "user" ? "你" : "助手"}</p>
                    <p className="text-xs whitespace-pre-wrap max-h-28 overflow-auto">{m.content}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <ChatInput onSend={handleSend} disabled={streaming || sheetRunning} />
              </div>
            </div>
          </div>
        ) : viewMode === "batch" ? (
          <div className="flex-1 overflow-auto px-3 pb-3 pt-3">
            <div className="mx-auto max-w-4xl space-y-4">
              <section className="app-surface brand-sheen overflow-hidden rounded-[2rem] px-6 py-7 sm:px-8 sm:py-9">
                <div className="max-w-3xl">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-semibold text-foreground/70 shadow-sm">
                    <Files className="h-3.5 w-3.5 text-[#5b7cfa]" />
                    Batch Processing
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">批量上传并逐个处理文件</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">使用同一条指令依次处理多个文件，查看每个文件的执行状态与结果。</p>
                </div>
              </section>
              <div className="rounded-2xl border border-border/70 bg-card/70 p-4 space-y-3">
                <label className="text-sm font-medium">统一处理指令</label>
                <textarea value={batchPrompt} onChange={(e) => setBatchPrompt(e.target.value)} rows={3} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" placeholder="例如：请总结这个文件并输出关键结论、风险点和下一步建议。" />
                <div className="flex flex-wrap items-center gap-2">
                  <input id="batch-files" type="file" multiple accept="image/*,.txt,.md,.py,.ts,.js,.tsx,.json,.csv,.xlsx,.xls,.docx,.pptx,.pdf" className="hidden" onChange={(e) => setBatchFiles(Array.from(e.target.files || []))} />
                  <button onClick={() => document.getElementById("batch-files")?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-card"><Upload className="h-4 w-4" />选择文件</button>
                  <button onClick={runBatchProcessing} disabled={batchRunning || streaming || batchFiles.length === 0} className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm text-primary disabled:opacity-50">{batchRunning ? "执行中..." : "开始批量处理"}</button>
                  <span className="text-xs text-muted-foreground">已选 {batchFiles.length} 个文件</span>
                </div>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">执行结果</h3>
                  <span className="text-xs text-muted-foreground">成功 {batchItems.filter((i) => i.status === "success").length} / 失败 {batchItems.filter((i) => i.status === "failed").length}</span>
                </div>
                <div className="space-y-2">
                  {batchItems.length === 0 ? <p className="text-sm text-muted-foreground">暂无执行记录</p> : batchItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === "success" ? "bg-emerald-100 text-emerald-700" : item.status === "failed" ? "bg-rose-100 text-rose-700" : item.status === "running" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{item.status === "success" ? "成功" : item.status === "failed" ? "失败" : item.status === "running" ? "执行中" : "排队中"}</span>
                      </div>
                      {item.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === "copydesk" ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 px-3 pb-3 pt-3">
            <div className="min-h-0 rounded-2xl border border-border/70 bg-card/70 p-4 flex flex-col">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      <PenSquare className="h-3.5 w-3.5 text-[#7b61ff]" />
                      文案编辑板
                    </div>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={copydeskImportInputRef}
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={handleImportDocx}
                  />
                  <button
                    onClick={() => {
                      setCopydeskContextMode((m) => (m === "off" ? "summary" : m === "summary" ? "full" : "off"));
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                      copydeskContextMode === "off"
                        ? "border-border/70 bg-card/60 text-muted-foreground hover:text-foreground"
                        : "border-primary/40 bg-primary/10 text-primary"
                    }`}
                    title="上下文模式：关闭 / 摘要 / 全文（点击切换）"
                  >
                    <Link2 className="h-3 w-3" />
                    上下文：{copydeskContextMode === "off" ? "关闭" : copydeskContextMode === "summary" ? "摘要" : "全文"}
                  </button>
                  <button onClick={() => copydeskImportInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"><Upload className="h-3 w-3" />导入Word</button>
                  <button onClick={handleExportDocx} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"><Download className="h-3 w-3" />导出Word</button>
                  <button onClick={handleImportFromLark} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">导入飞书</button>
                  <button onClick={handleExportToLark} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">导出飞书</button>
                  <button onClick={handleSendToLark} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">发送飞书</button>
                  <button onClick={() => navigator.clipboard.writeText(copydeskEditorRef.current?.innerText || "")} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" />复制全文</button>
                  <button onClick={clearCopydeskEditor} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">清空编辑器</button>
                </div>
              </div>
              {copydeskQa && (
                <div className="mb-3 rounded-xl border border-border/60 bg-background/65 p-2 text-xs">
                  <p className="font-semibold">导出前质检结果</p>
                  <p className="mt-1 text-muted-foreground">重复标点: {copydeskQa.duplicatePunct}，超长句(&gt;120字): {copydeskQa.longLines}，疑似重复词块: {copydeskQa.repeatedWords}</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={applyCopydeskQaFixes} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">一键修复</button>
                    <button onClick={handleExportDocx} className="rounded-md border border-border/70 bg-card/70 px-2 py-1 text-xs text-muted-foreground">修复后导出</button>
                  </div>
                </div>
              )}
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/65 p-2">
                <select value={copydeskFontFamily} onChange={(e) => { setCopydeskFontFamily(e.target.value); runEditorCommand("fontName", e.target.value); }} className="h-8 rounded-md border border-border/70 bg-card/70 px-2 text-xs">
                  <option value="Microsoft YaHei">微软雅黑</option>
                  <option value="PingFang SC">苹方</option>
                  <option value="Songti SC">宋体</option>
                  <option value="Arial">Arial</option>
                </select>
                <select value={copydeskFontSize} onChange={(e) => { setCopydeskFontSize(e.target.value); runEditorCommand("fontSize", e.target.value === "14" ? "3" : e.target.value === "16" ? "4" : e.target.value === "18" ? "5" : "6"); }} className="h-8 rounded-md border border-border/70 bg-card/70 px-2 text-xs">
                  <option value="14">14</option>
                  <option value="16">16</option>
                  <option value="18">18</option>
                  <option value="20">20</option>
                </select>
                <button onClick={() => runEditorCommand("bold")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><Bold className="h-3.5 w-3.5" /></button>
                <button onClick={() => runEditorCommand("italic")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><Italic className="h-3.5 w-3.5" /></button>
                <button onClick={() => runEditorCommand("underline")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><Underline className="h-3.5 w-3.5" /></button>
                <button onClick={() => runEditorCommand("insertUnorderedList")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><List className="h-3.5 w-3.5" /></button>
                <button onClick={() => runEditorCommand("insertOrderedList")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><ListOrdered className="h-3.5 w-3.5" /></button>
                <button onClick={() => runEditorCommand("justifyLeft")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><AlignLeft className="h-3.5 w-3.5" /></button>
                <button onClick={() => runEditorCommand("justifyCenter")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><AlignCenter className="h-3.5 w-3.5" /></button>
                <button onClick={() => runEditorCommand("justifyRight")} className="rounded-md border border-border/70 bg-card/60 p-1.5 text-muted-foreground hover:text-foreground"><AlignRight className="h-3.5 w-3.5" /></button>
                <button onClick={activateFormatBrush} className={`rounded-md border px-2 py-1 text-xs ${copydeskFormatBrush.active ? "border-primary/40 bg-primary/10 text-primary" : "border-border/70 bg-card/60 text-muted-foreground hover:text-foreground"}`}><Paintbrush className="mr-1 inline h-3 w-3" />格式刷</button>
              </div>
              <div className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-border/60 bg-background/65 p-2 whitespace-nowrap">
                <button onClick={handleInsertSelectionToChatInput} disabled={streaming || copydeskActionLoading} className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-primary disabled:opacity-50">选中输入</button>
                <button onClick={() => handleCopydeskAction("expand")} disabled={streaming || copydeskActionLoading} className="shrink-0 rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">扩写</button>
                <button onClick={() => handleCopydeskAction("shorten")} disabled={streaming || copydeskActionLoading} className="shrink-0 rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">精简</button>
                <button onClick={() => handleCopydeskAction("formal")} disabled={streaming || copydeskActionLoading} className="shrink-0 rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">改专业语气</button>
                <button onClick={() => handleCopydeskAction("headline")} disabled={streaming || copydeskActionLoading} className="shrink-0 rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">生成标题</button>
                <button onClick={() => handleCopydeskAction("continue")} disabled={streaming || copydeskActionLoading} className="shrink-0 rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">续写下一段</button>
                <span className="shrink-0 text-xs text-muted-foreground">版本回退</span>
                <select
                  className="h-8 shrink-0 rounded-md border border-border/70 bg-card/70 px-2 text-xs"
                  onChange={(e) => {
                    const v = copydeskVersions.find((x) => x.id === e.target.value);
                    if (v && copydeskEditorRef.current) {
                      copydeskEditorRef.current.innerHTML = v.html;
                      toast.success(`已恢复：${v.label} (${v.createdAt})`);
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>选择历史快照</option>
                  {copydeskVersions.map((v) => (
                    <option key={v.id} value={v.id}>{v.createdAt} · {v.label}</option>
                  ))}
                </select>
                <button onClick={handleUndoLastAiReplace} className="shrink-0 rounded-md border border-border/70 bg-card/60 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">撤销AI替换</button>
              </div>
              {pendingReplace && (
                <div className="mb-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-2">
                  <p className="text-xs font-semibold text-amber-700">替换确认（差异预览）</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">原文：</p>
                  <p className="max-h-16 overflow-auto rounded border border-border/60 bg-white/70 px-2 py-1 text-xs whitespace-pre-wrap">{pendingReplace.selectedText}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">新文：</p>
                  <p className="max-h-20 overflow-auto rounded border border-border/60 bg-white/70 px-2 py-1 text-xs whitespace-pre-wrap">{pendingReplace.content}</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={applyPendingReplace} className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-1 text-xs text-emerald-700">确认替换</button>
                    <button onClick={() => setPendingReplace(null)} className="rounded-md border border-border/70 bg-card/70 px-2 py-1 text-xs text-muted-foreground">取消</button>
                  </div>
                </div>
              )}
              <div
                ref={copydeskEditorWrapRef}
                className="relative flex-1 min-h-0"
                onMouseUp={handleCopydeskSelectionHover}
                onKeyUp={handleCopydeskSelectionHover}
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("[data-copydesk-floating-bar='true']")) return;
                  hideCopydeskFloatingBar();
                }}
              >
                {copydeskFloatingBar.visible && (
                  <div
                    data-copydesk-floating-bar="true"
                    className="absolute z-20 flex items-center gap-1 rounded-md border border-border/70 bg-card/95 p-1 shadow-md"
                    style={{ left: Math.max(0, copydeskFloatingBar.x), top: Math.max(0, copydeskFloatingBar.y) }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <span className="rounded border border-border/70 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">快捷功能</span>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleFloatingSelectionAutoReplace("rewrite", copydeskFloatingBar.text);
                        hideCopydeskFloatingBar();
                      }}
                      className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      改写
                    </button>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleFloatingSelectionAutoReplace("shorten", copydeskFloatingBar.text);
                        hideCopydeskFloatingBar();
                      }}
                      className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      精简
                    </button>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleFloatingSelectionAutoReplace("expand", copydeskFloatingBar.text);
                        hideCopydeskFloatingBar();
                      }}
                      className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      扩写
                    </button>
                  </div>
                )}
                <div ref={copydeskEditorRef} contentEditable suppressContentEditableWarning onInput={persistCopydeskDraft} className="h-full w-full overflow-auto rounded-xl border border-input bg-background p-4 leading-7 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" style={{ fontFamily: copydeskFontFamily, fontSize: `${copydeskFontSize}px` }} />
              </div>
            </div>
            <div className="min-h-0 rounded-2xl border border-border/70 bg-card/70 p-3 flex flex-col">
              <div className="mb-3">
                <p className="text-sm font-semibold">文案助手</p>
                <p className="text-xs text-muted-foreground mt-1">与左侧智能体、最近对话和技能配置实时同步。</p>
              </div>

              <div className="mb-2 rounded-xl border border-border/60 bg-background/70 p-2">
                <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">已选技能</div>
                <SkillSelector
                  favoritedSkills={favoritedSkills}
                  activeSkillNames={activeSkillNames}
                  onToggle={handleToggleSkill}
                />
              </div>

              <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-border/60 bg-background/55 p-2 space-y-2">
                {messages.length === 0 && !streamingContent ? (
                  <p className="text-xs text-muted-foreground">暂无历史对话。可在左侧“最近对话”直接切换，或在下方开始新提问。</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`rounded-lg border px-2 py-1.5 ${m.role === "user" ? "border-sky-200/60 bg-sky-50/40" : "border-border/60 bg-card/70"}`}>
                      <p className="mb-1 text-[10px] font-semibold text-muted-foreground">{m.role === "user" ? "你" : "助手"}</p>
                      <p className="max-h-40 overflow-auto text-xs whitespace-pre-wrap">{m.content}</p>
                      {m.role === "assistant" && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <button onClick={() => insertAssistantToEditor(m.content, "cursor")} className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">插入</button>
                          <button onClick={() => beginReplacePreview(m.content)} className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">替换选中</button>
                          <button onClick={() => insertAssistantToEditor(m.content, "append")} className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">追加</button>
                        </div>
                      )}
                    </div>
                  ))
                )}
                {streamingContent && (
                  <div className="rounded-lg border border-border/60 bg-card/70 px-2 py-1.5">
                    <p className="mb-1 text-[10px] font-semibold text-muted-foreground">助手（生成中）</p>
                    <p className="max-h-40 overflow-auto text-xs whitespace-pre-wrap">{streamingContent}</p>
                  </div>
                )}
              </div>

              <div
                className="mt-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropTextToChat}
              >
                <div className="mb-1 flex items-center justify-end gap-2 px-1">
                  <span className="text-[11px] text-muted-foreground">联网</span>
                  <button
                    onClick={() => setWebSearchEnabled((v) => !v)}
                    className={`h-7 rounded-md border px-2 text-xs ${
                      webSearchEnabled
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-border/70 bg-card/70 text-muted-foreground"
                    }`}
                    title="控制是否允许模型联网搜索"
                  >
                    {webSearchEnabled ? "已开启" : "已关闭"}
                  </button>
                  <span className="text-[11px] text-muted-foreground">RAG</span>
                  <select
                    value={globalRagMode}
                    onChange={(e) => setGlobalRagMode(e.target.value as RagMode)}
                    className="h-7 rounded-md border border-border/70 bg-card/70 px-2 text-xs text-muted-foreground"
                  >
                    <option value="off">不使用资料</option>
                    <option value="summary">智能参考资料</option>
                    <option value="full">严格依据资料</option>
                  </select>
                </div>
                <ChatInput
                  onSend={(message, files) => {
                    handleSend(message, files);
                    setCopydeskChatDraft("");
                  }}
                  disabled={streaming}
                  value={copydeskChatDraft}
                  onValueChange={setCopydeskChatDraft}
                  focusToken={copydeskChatFocusToken}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
              {messages.length === 0 && !streamingContent ? (
                <div className="flex min-h-full items-center justify-center px-5 py-10">
                  <div className="w-full max-w-4xl text-center">
                    <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/68 px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-sm">
                      <WandSparkles className="h-3.5 w-3.5 text-[#3678ff]" />
                      {currentAgent ? currentAgent.category : "AI Work"}
                    </div>
                    <h3 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
                      {currentAgent ? `${currentAgent.name} 已就绪` : "今天想完成什么？"}
                    </h3>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                      {currentAgent
                        ? "选择一个起点，或直接输入你的任务。"
                        : "写作、分析、翻译、代码和办公任务，都可以从这里开始。"}
                    </p>
                    <div className="mt-5 flex justify-center gap-2 md:hidden">
                      <button
                        onClick={handleSelectExperts}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card/70 px-4 text-sm font-medium shadow-sm"
                      >
                        <Sparkles className="h-4 w-4 text-[#3678ff]" />
                        专家广场
                      </button>
                      <button
                        onClick={handleSelectSkills}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card/70 px-4 text-sm font-medium shadow-sm"
                      >
                        <WandSparkles className="h-4 w-4 text-[#16a085]" />
                        技能市场
                      </button>
                    </div>
                    <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                      {agentPrompts.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(prompt)}
                          className="group flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-left text-sm text-foreground/82 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/35 hover:bg-card hover:shadow-md"
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-[#e8f0ff] group-hover:text-[#3678ff]">
                            <MessageCircle className="h-4 w-4" />
                          </span>
                          <span className="line-clamp-2">{prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-4xl pb-6 pt-2">
                  {messages.map((msg, index) => (
                    <div key={msg.id}>
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="mx-5 my-2">
                          {msg.toolCalls.map((tc) => (
                            <ToolCard key={tc.id} {...tc} />
                          ))}
                        </div>
                      )}
                      <ChatMessage role={msg.role} content={msg.content} />
                      {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                        <div className="px-5 -mt-1 mb-2 flex justify-end">
                          <div className="rounded-md border border-border/60 bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                            已上传：{msg.attachments.map((a) => a.name).join("、")}
                          </div>
                        </div>
                      )}
                      {msg.role === "assistant" && (
                        <div className="px-5 pl-[4.1rem] -mt-1 mb-2 flex items-center gap-2">
                          <button
                            onClick={() => handleRetryByAssistantIndex(index)}
                            disabled={streaming}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors disabled:opacity-50"
                            title="重试上一条用户请求"
                          >
                            <RotateCcw className="h-3 w-3" />
                            重试
                          </button>
                          <button
                            onClick={() => handleCopyByAssistantIndex(index)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
                            title="复制这条回复"
                          >
                            <Copy className="h-3 w-3" />
                            复制
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {streamingThink && (
                    <div className="mx-5 my-3 rounded-2xl border border-dashed border-border/80 bg-card/45 px-4 py-3">
                      <button
                        onClick={() => setShowThink((v) => !v)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mb-2"
                      >
                        {showThink ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="font-medium">思考过程</span>
                      </button>
                      {showThink && (
                        <div className="text-sm text-muted-foreground/60 whitespace-pre-wrap italic leading-relaxed pl-4 border-l-2 border-muted-foreground/10">
                          {streamingThink}
                        </div>
                      )}
                    </div>
                  )}

                  {streamingTools.length > 0 && (
                    <div className="mx-5 my-2">
                      {streamingTools.map((tc) => (
                        <ToolCard key={tc.id} {...tc} />
                      ))}
                    </div>
                  )}

                  {streamingContent && <ChatMessage role="assistant" content={streamingContent} />}

                  {streaming && !streamingContent && !streamingThink && <TypingIndicator />}
                </div>
              )}
            </ScrollArea>

            <div className="px-4 mb-0.5">
              <div className="mx-auto max-w-4xl flex items-center justify-end gap-2">
                <span className="text-[11px] text-muted-foreground">联网</span>
                <button
                  onClick={() => setWebSearchEnabled((v) => !v)}
                  className={`h-7 rounded-md border px-2 text-xs ${webSearchEnabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-border/70 bg-card/70 text-muted-foreground"}`}
                  title="控制是否允许模型调用联网搜索工具"
                >
                  {webSearchEnabled ? "已开启" : "已关闭"}
                </button>
                <span className="text-[11px] text-muted-foreground">RAG</span>
                <select
                  value={globalRagMode}
                  onChange={(e) => setGlobalRagMode(e.target.value as RagMode)}
                  className="h-7 rounded-md border border-border/70 bg-card/70 px-2 text-xs text-muted-foreground"
                >
                  <option value="off">不使用资料</option>
                  <option value="summary">智能参考资料</option>
                  <option value="full">严格依据资料</option>
                </select>
                {favoritedSkills.length > 0 && (
                  <div className="ml-1 flex items-center gap-2 rounded-2xl border border-border/60 bg-card/60 px-2.5 py-1 shadow-sm backdrop-blur-xl">
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-[460px]">
                      {activeSkillNames.map((name) => {
                        const sk = allSkills.find((s) => s.name === name);
                        const displayName = sk?.displayName || name;
                        return (
                          <Badge
                            key={name}
                            variant="default"
                            className="gap-1 text-[11px] font-normal h-6 shrink-0 rounded-full"
                          >
                            {displayName}
                            <button onClick={() => handleToggleSkill(name)} className="hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                    <SkillSelector
                      favoritedSkills={favoritedSkills}
                      activeSkillNames={activeSkillNames}
                      onToggle={handleToggleSkill}
                    />
                  </div>
                )}
              </div>
            </div>
            <ChatInput onSend={handleSend} disabled={streaming} />
            <div className="px-4 pb-3 -mt-2">
              <input
                ref={batchInputRef}
                type="file"
                multiple
                accept="image/*,.txt,.md,.py,.ts,.js,.tsx,.json,.csv,.xlsx,.xls,.docx,.pptx,.pdf"
                className="hidden"
                onChange={handleBatchFiles}
              />
              <button
                onClick={() => batchInputRef.current?.click()}
                disabled={streaming}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-50"
              >
                批量处理入口
              </button>
            </div>
          </>
        )}
      </div>

      <AgentEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={handleAgentSaved}
      />
    </div>
  );
}
