"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput, FileItem } from "@/components/chat-input";
import { Button } from "@/components/ui/button";
import { ConversationList } from "@/components/conversation-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToolCard } from "@/components/tool-card";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, ChevronDown, ChevronRight, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";
import { safeJson } from "@/lib/fetch";
import { uid } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
  attachments?: Array<Pick<FileItem, "name" | "kind">>;
  retryFiles?: FileItem[];
}

interface ToolCallEvent {
  id: string;
  name: string;
  input: string;
  output: string;
  ok: boolean;
  durationMs: number;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ConversationDetailResponse {
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    toolExecutions?: string | null;
  }>;
}

interface Props {
  agentId: string;
  agentName: string;
  agentDescription: string;
  agentIcon: string;
  examplePrompts: string[];
  currentUserId: string;
  initialConversationId?: string;
  agentSkillNames: string[];
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-6 py-8">
      <div className="flex items-center gap-1.5 bg-muted/60 rounded-2xl px-4 py-2.5">
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

export function ChatPageClient({
  agentId,
  agentName,
  agentDescription,
  examplePrompts,
  initialConversationId,
  agentSkillNames,
}: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  useEffect(() => {
    queueMicrotask(() => {
      setConversationId(initialConversationId);
    });
  }, [initialConversationId]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolCallEvent[]>([]);
  const [streamingThink, setStreamingThink] = useState("");
  const [showThink, setShowThink] = useState(true);
  const [activeSkills, setActiveSkills] = useState<string[]>(agentSkillNames);
  const scrollRef = useRef<HTMLDivElement>(null);
  const batchInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, streamingTools, streamingThink, scrollToBottom]);

  const fetchConversations = useCallback(async () => {
    const res = await fetch(`/api/conversations?agentId=${agentId}`);
    if (res.ok) setConversations(await safeJson<Conversation[]>(res));
  }, [agentId]);

  const fetchMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/conversations/${convId}`);
    if (res.ok) {
      const data = await safeJson<ConversationDetailResponse>(res);
      const msgs: Message[] = (data.messages || []).map((m) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        content: m.content || "",
        toolCalls: m.toolExecutions ? JSON.parse(m.toolExecutions) : undefined,
      }));
      setMessages(msgs);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchConversations();
    });
  }, [fetchConversations]);

  useEffect(() => {
    if (conversationId) {
      queueMicrotask(() => {
        void fetchMessages(conversationId);
      });
    }
  }, [conversationId, fetchMessages]);

  async function createConversation(firstMessage: string): Promise<string> {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, title: firstMessage.slice(0, 50) }),
    });
    if (!res.ok) throw new Error("创建对话失败");
    return (await safeJson(res)).id;
  }

  async function handleSend(content: string, files?: FileItem[]) {
    if (streaming) return;

    let convId = conversationId;

    if (!convId) {
      try {
        const title = files && files.length > 0 ? `[文件] ${files[0].name}` : content.slice(0, 50);
        convId = await createConversation(title);
        setConversationId(convId);
        await fetchConversations();
        window.history.replaceState(null, "", `/agent/${agentId}?conversation=${convId}`);
      } catch {
        toast.error("创建对话失败");
        return;
      }
    }

    const userMsg: Message = {
      id: uid(),
      role: "user",
      content,
      attachments: (files || []).map((f) => ({ name: f.name, kind: f.kind })),
      retryFiles: files,
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent("");
    setStreamingTools([]);
    setStreamingThink("");
    setShowThink(true);

    await new Promise((r) => setTimeout(r, 0));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, conversationId: convId, message: content, files, activeSkills }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const reader = response.body?.getReader();
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
            if (event.type === "tool") {
              tools.push(event);
              setStreamingTools([...tools]);
            } else if (event.type === "think") {
              setStreamingThink(event.content || "");
            } else if (event.type === "text") {
              fullContent = event.content || "";
              setStreamingContent(fullContent);
            } else if (event.type === "error") {
              throw new Error(event.content);
            }
          } catch {}
        }
      }

      const explain = buildFailureExplanation(tools);
      const finalContent = explain ? `${fullContent}\n\n[失败原因解释]\n${explain}` : fullContent;
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: finalContent, toolCalls: tools },
      ]);
      setStreamingContent("");
      setStreamingTools([]);
      void fetchConversations();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      toast.error(`发送失败: ${message}`);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `执行失败。\n\n[失败原因解释]\n${buildErrorExplanation(message)}` },
      ]);
      setStreamingContent("");
      setStreamingTools([]);
    } finally {
      setStreaming(false);
    }
  }

  async function handleNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    router.replace(`/agent/${agentId}`);
  }

  async function deleteConversation(id: string) {
    if (!confirm("确定删除此对话？")) return;
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (conversationId === id) {
        setConversationId(undefined);
        setMessages([]);
        router.replace(`/agent/${agentId}`);
      }
      void fetchConversations();
      toast.success("对话已删除");
    } else {
      toast.error("删除失败");
    }
  }

  async function clearContext() {
    if (!conversationId) return;
    if (!confirm("确定清空当前对话的所有消息？对话会保留在列表中。")) return;
    const res = await fetch(`/api/conversations/${conversationId}/messages`, { method: "DELETE" });
    if (res.ok) {
      setMessages([]);
      toast.success("上下文已清空");
    } else {
      toast.error("清空失败");
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
      const isOffice = !isImage && ["xlsx", "xls", "docx", "pptx"].includes(ext);
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <ConversationList
        conversations={conversations}
        agentId={agentId}
        agentName={agentName}
        currentId={conversationId}
        onNew={handleNewConversation}
        onDelete={deleteConversation}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Header */}
        <div className="border-b px-5 py-2.5 flex items-center gap-3 shrink-0 bg-card/50 backdrop-blur-sm">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{agentName}</h2>
            <p className="text-[11px] text-muted-foreground truncate">{agentDescription}</p>
          </div>
          {conversationId && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-8" onClick={clearContext}>
              清空上下文
            </Button>
          )}
        </div>

        {agentSkillNames.length > 0 && (
          <div className="border-b px-5 py-2 flex items-center gap-2 shrink-0 overflow-x-auto">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {agentSkillNames.map((name) => (
              <Badge
                key={name}
                variant={activeSkills.includes(name) ? "default" : "outline"}
                className="cursor-pointer text-[11px] font-medium"
                onClick={() => {
                  setActiveSkills((prev) =>
                    prev.includes(name)
                      ? prev.filter((n) => n !== name)
                      : [...prev, name]
                  );
                }}
              >
                {name}
              </Badge>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          {messages.length === 0 && !streaming ? (
            <div className="flex items-center justify-center h-full py-24">
              <div className="text-center max-w-md px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-5">
                  <Sparkles className="h-8 w-8 text-primary/60" />
                </div>
                <h3 className="text-lg font-semibold mb-1">{agentName}</h3>
                <p className="text-sm text-muted-foreground mb-6">{agentDescription}</p>
                {examplePrompts.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {examplePrompts.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(prompt)}
                        className="px-3.5 py-2 rounded-xl bg-card border border-border/70 text-sm text-foreground/80 hover:border-primary/30 hover:bg-primary/[0.03] hover:text-primary transition-all duration-200 shadow-sm"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="pb-4">
              {messages.map((msg, index) => (
                <div key={msg.id}>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="px-4 py-2 bg-muted/30">
                      {msg.toolCalls.map((tc) => (
                        <ToolCard key={tc.id} {...tc} />
                      ))}
                    </div>
                  )}
                  <ChatMessage role={msg.role} content={msg.content} />
                  {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                    <div className="px-6 -mt-1 mb-2 flex justify-end">
                      <div className="rounded-md border border-border/60 bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                        已上传：{msg.attachments.map((a) => a.name).join("、")}
                      </div>
                    </div>
                  )}
                  {msg.role === "assistant" && (
                    <div className="px-6 pl-[4.6rem] -mt-1 mb-2 flex items-center gap-2">
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

              {streaming && !streamingContent && !streamingThink && streamingTools.length === 0 && (
                <TypingIndicator />
              )}

              {streamingTools.length > 0 && (
                <div className="px-4 py-2 bg-muted/30">
                  {streamingTools.map((tc) => (
                    <ToolCard key={tc.id} {...tc} />
                  ))}
                </div>
              )}

              {streamingThink && (
                <div className="px-4 sm:px-6 py-3 border-b border-dashed border-muted-foreground/15">
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

              {streamingContent && <ChatMessage role="assistant" content={streamingContent} />}
            </div>
          )}
        </ScrollArea>

        <ChatInput
          onSend={handleSend}
          disabled={streaming}
          examplePrompts={messages.length === 0 ? examplePrompts : undefined}
        />
        <div className="px-4 pb-3 -mt-2">
          <input
            ref={batchInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.py,.ts,.js,.tsx,.json,.csv,.xlsx,.xls,.docx,.pptx"
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
      </div>
    </div>
  );
}
