import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function ChatMessage({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 px-5 py-4 animate-[message-in_0.35s_cubic-bezier(0.16,1,0.3,1)_forwards]",
        isUser ? "flex-row-reverse" : ""
      )}
    >
      <Avatar
        className={cn(
          "h-9 w-9 shrink-0 ring-2 ring-background mt-0.5",
          isUser ? "ring-[#3678ff]/10" : "ring-border/80"
        )}
      >
        <AvatarFallback
          className={cn(
            "text-xs",
            isUser
              ? "bg-[#3678ff] text-white"
              : "bg-primary text-primary-foreground"
          )}
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>

      <div className={cn("flex max-w-[82%] flex-col min-w-0", isUser ? "items-end text-right" : "items-start text-left")}>
        <div
          className={cn(
            "mb-1.5 inline-flex items-center gap-1.5 select-none",
            isUser ? "flex-row-reverse text-[#3678ff]" : "text-muted-foreground/70"
          )}
        >
          <span className={cn("text-[11px] font-semibold leading-none", isUser ? "" : "tracking-[0.08em]")}>
            {isUser ? "你" : "AI 助手"}
          </span>
          {!isUser && <span className="h-1 w-1 rounded-full bg-muted-foreground/45" />}
        </div>
          {content.includes("/api/download/") ? (
            <div
              className={cn(
                "rounded-3xl px-4 py-3 text-[15px] leading-7 shadow-sm",
                isUser
                  ? "rounded-tr-xl bg-[#e8f0ff] text-foreground"
                  : "rounded-tl-lg border border-border/70 bg-card/76 text-foreground/90"
              )}
            >
              <div className="whitespace-pre-wrap">{content}</div>
              {(() => {
                const urls = content.match(/\/api\/download\/[^\s)\]》]+/g);
                if (!urls) return null;
                return urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    download
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/5"
                  >
                    📄 下载文件 {urls.length > 1 ? `${i + 1}` : ""}
                  </a>
                ));
              })()}
            </div>
          ) : (
            <div
              className={cn(
                "rounded-3xl px-4 py-3 text-[15px] leading-7 shadow-sm whitespace-pre-wrap",
                isUser
                  ? "rounded-tr-xl bg-[#e8f0ff] text-foreground"
                  : "rounded-tl-lg border border-border/70 bg-card/76 text-foreground/90"
              )}
            >
              {content}
            </div>
          )}
      </div>
    </div>
  );
}
