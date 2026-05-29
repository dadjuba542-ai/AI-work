"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface FileItem {
  name: string;
  type: string;
  data: string;
  kind: "image" | "text" | "office";
}

interface ChatInputProps {
  onSend: (message: string, files?: FileItem[]) => void;
  disabled?: boolean;
  examplePrompts?: string[];
  value?: string;
  onValueChange?: (value: string) => void;
  focusToken?: number;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 20;

export function ChatInput({ onSend, disabled, examplePrompts, value, onValueChange, focusToken }: ChatInputProps) {
  const [innerInput, setInnerInput] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isControlled = value !== undefined;
  const input = isControlled ? value : innerInput;
  const setInput = (next: string) => {
    if (isControlled) onValueChange?.(next);
    else setInnerInput(next);
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (focusToken !== undefined) textareaRef.current?.focus();
  }, [focusToken]);

  async function compressImage(file: File): Promise<File> {
    const bitmap = await createImageBitmap(file);
    const MAX = 2048;
    let { width, height } = bitmap;
    if (width > MAX || height > MAX) {
      if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
      else { width = Math.round(width * MAX / height); height = MAX; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("压缩失败")), "image/jpeg", 0.8);
    });
    bitmap.close();
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const remaining = MAX_FILES - files.length;
    const batch = selected.slice(0, remaining);

    for (const f of batch) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} 超过 20MB 限制`);
      }
    }

    const valid = batch.filter((f) => f.size <= MAX_FILE_SIZE);

    const results = await Promise.all(
      valid.map(async (f) => {
        const isImage = f.type.startsWith("image/");
        const file = isImage && f.size > 1024 * 1024 ? await compressImage(f) : f;
        const b64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve((r.result as string).split(",")[1]);
          r.readAsDataURL(file);
        });
        const ext = f.name.split(".").pop()?.toLowerCase() || "";
        const isOffice = !isImage && ["xlsx", "xls", "docx", "pptx", "pdf"].includes(ext);
        return { name: file.name, type: file.type, data: b64, kind: isImage ? "image" : isOffice ? "office" : "text" } as FileItem;
      })
    );

    setFiles((prev) => [...prev, ...results]);

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
    <div className="px-4 pb-4 pt-2">
      <div className="mx-auto max-w-4xl rounded-[1.75rem] border border-border/70 bg-card/82 p-3 shadow-[0_18px_55px_rgba(32,28,18,0.1)] backdrop-blur-xl">
      {examplePrompts && examplePrompts.length > 0 && files.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {examplePrompts.map((prompt, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="cursor-pointer rounded-full hover:bg-secondary/80 transition-colors"
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
        <div className="flex flex-wrap gap-2 mb-3">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-2.5 py-1.5">
              {f.kind === "image" ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <button onClick={() => removeFile(i)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-[44px] items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*,.txt,.md,.py,.ts,.js,.tsx,.json,.csv,.xlsx,.xls,.docx,.pptx,.pdf" multiple className="hidden" onChange={handleFileSelect} />
        <Button
          variant="secondary"
          size="icon"
          disabled={disabled || files.length >= MAX_FILES}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 rounded-2xl bg-muted/75"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="发消息给 AI Work"
          className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent px-2 py-2 leading-6 shadow-none focus-visible:ring-0"
          rows={1}
          disabled={disabled}
        />
        <Button
          onClick={handleSend}
          disabled={disabled || (!input.trim() && files.length === 0)}
          size="icon"
          className="shrink-0 rounded-2xl"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      </div>
    </div>
  );
}
