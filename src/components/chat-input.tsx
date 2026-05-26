"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X, FileText, Image } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface FileItem {
  name: string;
  type: string;
  data: string;
  kind: "image" | "text";
}

interface ChatInputProps {
  onSend: (message: string, files?: FileItem[]) => void;
  disabled?: boolean;
  examplePrompts?: string[];
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;

export function ChatInput({ onSend, disabled, examplePrompts }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;

    for (const f of Array.from(selected)) {
      if (files.length + selected.length > MAX_FILES) break;
      if (f.size > MAX_FILE_SIZE) continue;

      const b64 = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(",")[1]);
        r.readAsDataURL(f);
      });

      const isImage = f.type.startsWith("image/");
      setFiles((prev) => [
        ...prev,
        { name: f.name, type: f.type, data: b64, kind: isImage ? "image" : "text" },
      ]);
    }

    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSend() {
    const trimmed = input.trim();
    if ((!trimmed && files.length === 0) || disabled) return;
    onSend(trimmed, files.length > 0 ? files : undefined);
    setInput("");
    setFiles([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      {examplePrompts && examplePrompts.length > 0 && files.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {examplePrompts.map((prompt, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/80 transition-colors"
              onClick={() => {
                setInput(prompt);
                textareaRef.current?.focus();
              }}
            >
              {prompt}
            </Badge>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 text-xs bg-muted rounded-md px-2 py-1">
              {f.kind === "image" ? <Image className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button onClick={() => removeFile(i)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <input ref={fileInputRef} type="file" accept="image/*,.txt,.md,.py,.ts,.js,.tsx,.json,.csv" multiple className="hidden" onChange={handleFileSelect} />
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || files.length >= MAX_FILES}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          className="min-h-[44px] max-h-[200px] resize-none"
          rows={1}
          disabled={disabled}
        />
        <Button
          onClick={handleSend}
          disabled={disabled || (!input.trim() && files.length === 0)}
          size="icon"
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
