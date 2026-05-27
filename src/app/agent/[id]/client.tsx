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
import { Bot, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { safeJson } from "@/lib/fetch";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
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
  // 同步 URL 参数到 state，解决点对话记录不加载的问题
  useEffect(() => { setConversationId(initialConversationId); }, [initialConversationId]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTools, setStreamingTools] = useState<ToolCallEvent[]>([]);
  const [streamingThink, setStreamingThink] = useState("");
  const [activeSkills, setActiveSkills] = useState<string[]>(agentSkillNames);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingContent, streamingTools, streamingThink, scrollToBottom]);

  useEffect(() => { fetchConversations(); }, [agentId]);

  useEffect(() => {
    if (conversationId) fetchMessages(conversationId);
  }, [conversationId]);

  async function fetchConversations() {
    const res = await fetch(`/api/conversations?agentId=${agentId}`);
    if (res.ok) setConversations(await safeJson(res));
  }

  async function fetchMessages(convId: string) {
    const res = await fetch(`/api/conversations/${convId}`);
    if (res.ok) {
      const data = await safeJson(res);
      const msgs: Message[] = (data.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        content: m.content || "",
        toolCalls: m.toolExecutions ? JSON.parse(m.toolExecutions) : undefined,
      }));
      setMessages(msgs);
    }
  }

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

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamingContent("");
    setStreamingTools([]);
    setStreamingThink("");

    // Yield to React so progress bar renders before fetch blocks
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
            console.log("[stream]", event.type, (event.content || event.name || "").slice(0, 60));

            if (event.type === "tool") {
              tools.push(event);
              setStreamingTools([...tools]);
            } else if (event.type === "think") {
              setStreamingThink(event.content || "");
            } else if (event.type === "text") {
              fullContent = event.content || "";
              setStreamingContent(fullContent);
            } else if (event.type === "done") {
              // handled after loop
            } else if (event.type === "error") {
              throw new Error(event.content);
            }
          } catch {}
        }
      }

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: fullContent, toolCalls: tools },
      ]);
      setStreamingContent("");
      setStreamingTools([]);
      fetchConversations();
    } catch (err: any) {
      toast.error(`发送失败: ${err.message}`);
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
      fetchConversations();
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <ConversationList
        conversations={conversations}
        agentId={agentId}
        currentId={conversationId}
        onNew={handleNewConversation}
        onDelete={deleteConversation}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b px-4 py-3 flex items-center gap-3 shrink-0">
          <Bot className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-semibold text-sm">{agentName}</h2>
            <p className="text-xs text-muted-foreground">{agentDescription}</p>
          </div>
          {conversationId && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearContext}>
              清空上下文
            </Button>
          )}
        </div>

        {agentSkillNames.length > 0 && (
          <div className="border-b px-4 py-1.5 flex items-center gap-2 shrink-0 overflow-x-auto">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {agentSkillNames.map((name) => (
              <Badge
                key={name}
                variant={activeSkills.includes(name) ? "default" : "outline"}
                className="cursor-pointer text-xs"
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

        <ScrollArea className="flex-1" ref={scrollRef}>
          {messages.length === 0 && !streaming ? (
            <div className="flex items-center justify-center h-full py-24">
              <div className="text-center">
                <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">选择一个 Agent 开始对话</p>
                {examplePrompts.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {examplePrompts.map((prompt, i) => (
                      <Badge key={i} variant="secondary" className="cursor-pointer hover:bg-secondary/80" onClick={() => handleSend(prompt)}>
                        {prompt}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="px-4 py-2 bg-muted/30">
                      {msg.toolCalls.map((tc) => (
                        <ToolCard key={tc.id} {...tc} />
                      ))}
                    </div>
                  )}
                  <ChatMessage role={msg.role} content={msg.content} />
                </div>
              ))}
              {streaming && !streamingContent && !streamingThink && streamingTools.length === 0 && (
                <div className="px-6 py-8">
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full w-1/3 bg-primary rounded-full animate-indeterminate" />
                  </div>
                  <p className="text-xs text-muted-foreground/60 text-center mt-2">正在思考...</p>
                </div>
              )}
              {streamingTools.length > 0 && (
                <div className="px-4 py-2 bg-muted/30">
                  {streamingTools.map((tc) => (
                    <ToolCard key={tc.id} {...tc} />
                  ))}
                </div>
              )}
              {streamingThink && (
                <div className="px-4 py-3 border-b border-dashed border-muted-foreground/20">
                  <p className="text-xs text-muted-foreground/60 mb-1">思考过程</p>
                  <div className="text-sm text-muted-foreground/70 whitespace-pre-wrap italic">
                    {streamingThink}
                  </div>
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
      </div>
    </div>
  );
}
