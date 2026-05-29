"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const models = [
  "MiniMax-M2.7",
  "MiniMax-M2.7-highspeed",
  "MiniMax-M2.5",
  "MiniMax-M2.5-highspeed",
  "MiniMax-M2.1",
  "MiniMax-M2.1-highspeed",
  "MiniMax-M2",
  "M2-her",
];

const icons = [
  { value: "bot", label: "机器人" },
  { value: "file-text", label: "文档" },
  { value: "clipboard", label: "剪贴板" },
  { value: "search", label: "搜索" },
  { value: "code", label: "代码" },
  { value: "lightbulb", label: "创意" },
  { value: "chart-bar", label: "图表" },
  { value: "database", label: "数据库" },
];

interface AgentEditorProps {
  open: boolean;
  onClose: () => void;
  agent?: {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    examplePrompts: string | string[];
    icon: string;
    category: string;
    model: string;
    temperature: string;
    maxIterations: number;
    reviewStatus: string;
  };
  onSaved: () => void;
}

export function AgentEditor({ open, onClose, agent, onSaved }: AgentEditorProps) {
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!agent;
  const getString = (form: FormData, key: string) => String(form.get(key) ?? "");

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const body: Record<string, string | number | string[]> = {
      name: getString(form, "name"),
      description: getString(form, "description"),
      systemPrompt: getString(form, "systemPrompt"),
      examplePrompts: parsePrompts(getString(form, "examplePrompts")),
      icon: getString(form, "icon"),
      category: getString(form, "category") || "general",
      model: getString(form, "model"),
      temperature: getString(form, "temperature") || "0.7",
      maxIterations: parseInt(getString(form, "maxIterations"), 10) || 5,
    };

    try {
      const url = isEditing ? `/api/agents/${agent.id}` : "/api/agents";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error((await res.text()) || "保存失败");

      toast.success(isEditing ? "已更新" : "已创建");
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(`保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForReview() {
    if (!agent) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/submit`, { method: "POST" });
      if (!res.ok) throw new Error((await res.text()) || "提交失败");
      toast.success("已提交审核");
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(`提交失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑智能体" : "创建智能体"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4" key={agent?.id || "new"}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">名称</Label>
              <Input id="name" name="name" defaultValue={agent?.name} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">分类</Label>
              <Input id="category" name="category" defaultValue={agent?.category || "general"} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Input id="description" name="description" defaultValue={agent?.description} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="icon">图标</Label>
              <Select name="icon" defaultValue={agent?.icon || "bot"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {icons.map((ic) => (
                    <SelectItem key={ic.value} value={ic.value}>{ic.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">模型</Label>
              <Select name="model" defaultValue={agent?.model || "MiniMax-M2.7"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="temperature">随机度</Label>
              <Input id="temperature" name="temperature" defaultValue={agent?.temperature || "0.7"} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxIterations">最大迭代次数</Label>
              <Input id="maxIterations" name="maxIterations" type="number" defaultValue={agent?.maxIterations || 5} min={1} max={20} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">系统提示词</Label>
            <Textarea id="systemPrompt" name="systemPrompt" defaultValue={agent?.systemPrompt} rows={6} required className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="examplePrompts">推荐问题 (每行一个)</Label>
            <Textarea
              id="examplePrompts"
              name="examplePrompts"
              defaultValue={agent?.examplePrompts ? (Array.isArray(agent.examplePrompts) ? agent.examplePrompts.join("\n") : agent.examplePrompts) : ""}
              rows={4}
              placeholder="每行写一个推荐问题"
              className="text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            {isEditing && agent?.reviewStatus === "none" && (
              <Button type="button" variant="outline" onClick={handleSubmitForReview} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                提交审核
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {isEditing ? "保存" : "创建"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function parsePrompts(val: string | null): string[] {
  if (!val) return [];
  return val
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
