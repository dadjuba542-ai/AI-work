"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { safeJson } from "@/lib/fetch";
import { Plus, Pencil, Trash2, Eye, EyeOff, Key, Sparkles, Upload, Globe } from "lucide-react";

type Agent = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  systemPrompt: string;
  examplePrompts: string;
  model: string;
  temperature: string;
  isPublished: boolean;
  maxIterations: number;
};

type Skill = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  toolsAllowed: string;
  icon: string;
  category: string;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

export function AdminPanel() {
  const [tab, setTab] = useState("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("https://api.minimaxi.com");
  const [savingKey, setSavingKey] = useState(false);

  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", role: "user" });
  const [showUserDialog, setShowUserDialog] = useState(false);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [marketplaceSkills, setMarketplaceSkills] = useState<any[]>([]);
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [agentSkillIds, setAgentSkillIds] = useState<string[]>([]);

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAgents = useCallback(async () => {
    const res = await fetch("/api/agents");
    if (res.ok) setAgents(await safeJson(res));
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await safeJson(res));
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const data = await safeJson(res);
      setApiKey(data.llm_api_key || "");
      const raw = data.llm_base_url || "";
      setApiBase(raw.replace(/\/v1\/chat\/completions\/?$/, "").replace(/\/v1\/?$/, "") || "https://api.minimaxi.com");
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    const res = await fetch("/api/skills");
    if (res.ok) setSkills(await safeJson(res));
    fetchMarketplace();
  }, []);

  const fetchAgentSkills = useCallback(async (agentId: string) => {
    const res = await fetch(`/api/agents/${agentId}/skills`);
    if (res.ok) setAgentSkillIds(await safeJson(res));
  }, []);

  const fetchMarketplace = useCallback(async () => {
    const res = await fetch("/api/skills/marketplace");
    if (res.ok) setMarketplaceSkills(await safeJson(res));
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchUsers();
    loadSettings();
    fetchSkills();
    fetchMarketplace();
  }, [fetchAgents, fetchUsers, loadSettings]);

  async function saveApiKey(e: React.FormEvent) {
    e.preventDefault();
    setSavingKey(true);
    const normalized = apiBase.replace(/\/v1\/chat\/completions\/?$/, "").replace(/\/v1\/?$/, "");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ llm_api_key: apiKey, llm_base_url: normalized }),
    });
    if (res.ok) {
      toast.success("API 配置已保存");
    } else {
      toast.error("保存失败");
    }
    setSavingKey(false);
  }

  async function saveAgent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: any = {};
    form.forEach((v, k) => {
      if (k === "isPublished") data[k] = v === "true";
      else data[k] = v;
    });

    const url = editingAgent ? `/api/agents/${editingAgent.id}` : "/api/agents";
    const method = editingAgent ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success(editingAgent ? "Agent 已更新" : "Agent 已创建");
      const newId = res.status === 201 ? (await safeJson(res)).id : editingAgent?.id;
      if (newId) {
        await fetch(`/api/agents/${newId}/skills`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillIds: agentSkillIds }),
        });
      }
      setShowAgentDialog(false);
      setEditingAgent(null);
      setAgentSkillIds([]);
      fetchAgents();
    } else {
      toast.error("操作失败");
    }
  }

  async function deleteAgent(id: string) {
    if (!confirm("确定删除此 Agent？")) return;
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    toast.success("Agent 已删除");
    fetchAgents();
  }

  async function toggleAgent(id: string, published: boolean) {
    await fetch(`/api/agents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !published }),
    });
    fetchAgents();
  }

  async function saveSkill(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: any = {};
    form.forEach((v, k) => (data[k] = v as string));

    const url = editingSkill ? `/api/skills/${editingSkill.id}` : "/api/skills";
    const method = editingSkill ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success(editingSkill ? "技能已更新" : "技能已创建");
      setShowSkillDialog(false);
      setEditingSkill(null);
      fetchSkills();
    } else {
      toast.error("操作失败");
    }
  }

  async function deleteSkill(id: string) {
    if (!confirm("确定删除此技能？")) return;
    const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("技能已删除");
      fetchSkills();
    } else {
      const err = await safeJson(res);
      toast.error(err.error || "删除失败");
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });

    if (res.ok) {
      toast.success("用户已创建");
      setShowUserDialog(false);
      setNewUser({ email: "", name: "", password: "", role: "user" });
      fetchUsers();
    } else {
      const err = await safeJson(res);
      toast.error(err.error || "创建失败");
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">管理后台</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            统一 API 配置
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveApiKey} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 MiniMax API Key"
              />
            </div>
            <div className="space-y-1 min-w-[200px]">
              <Label htmlFor="api-base">接口地址</Label>
              <Input
                id="api-base"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={savingKey}>
              {savingKey ? "保存中..." : "保存"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="agents">Agent 管理</TabsTrigger>
          <TabsTrigger value="marketplace">技能市场</TabsTrigger>
          <TabsTrigger value="skills">已安装技能</TabsTrigger>
          <TabsTrigger value="users">用户管理</TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Agent 列表</h2>
            <Button onClick={() => { setEditingAgent(null); setShowAgentDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />新建 Agent
            </Button>
          </div>

          <div className="space-y-2">
            {agents.map((agent) => (
              <Card key={agent.id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <Badge variant="outline" className="text-xs">{agent.category}</Badge>
                      {!agent.isPublished && <Badge variant="secondary" className="text-xs">未发布</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{agent.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => toggleAgent(agent.id, agent.isPublished)} title={agent.isPublished ? "下线" : "发布"}>
                      {agent.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { setEditingAgent(agent); setShowAgentDialog(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteAgent(agent.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingAgent ? "编辑 Agent" : "新建 Agent"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveAgent} className="space-y-4" key={editingAgent?.id || "new"}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">名称</Label>
                    <Input id="name" name="name" defaultValue={editingAgent?.name} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">分类</Label>
                    <Input id="category" name="category" defaultValue={editingAgent?.category || "general"} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">描述</Label>
                  <Input id="description" name="description" defaultValue={editingAgent?.description} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="icon">图标</Label>
                    <Select name="icon" defaultValue={editingAgent?.icon || "bot"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bot">机器人</SelectItem>
                        <SelectItem value="file-text">文档</SelectItem>
                        <SelectItem value="clipboard">剪贴板</SelectItem>
                        <SelectItem value="search">搜索</SelectItem>
                        <SelectItem value="mail">邮件</SelectItem>
                        <SelectItem value="users">用户</SelectItem>
                        <SelectItem value="code">代码</SelectItem>
                        <SelectItem value="database">数据库</SelectItem>
                        <SelectItem value="languages">翻译</SelectItem>
                        <SelectItem value="lightbulb">创意</SelectItem>
                        <SelectItem value="chart-bar">图表</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="model">模型</Label>
                    <Select name="model" defaultValue={editingAgent?.model || "MiniMax-M2.7"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MiniMax-M2.7">MiniMax-M2.7（复杂任务 / 默认）</SelectItem>
                        <SelectItem value="MiniMax-M2.7-highspeed">MiniMax-M2.7 极速版</SelectItem>
                        <SelectItem value="MiniMax-M2.5">MiniMax-M2.5（简单任务 / 性价比）</SelectItem>
                        <SelectItem value="MiniMax-M2.5-highspeed">MiniMax-M2.5 极速版</SelectItem>
                        <SelectItem value="MiniMax-M2.1">MiniMax-M2.1（编程场景）</SelectItem>
                        <SelectItem value="MiniMax-M2.1-highspeed">MiniMax-M2.1 极速版</SelectItem>
                        <SelectItem value="MiniMax-M2">MiniMax-M2（编码 + Agent）</SelectItem>
                        <SelectItem value="M2-her">M2-her（对话）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="temperature">随机度</Label>
                    <Input id="temperature" name="temperature" defaultValue={editingAgent?.temperature || "0.7"} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxIterations">最大迭代次数</Label>
                    <Input id="maxIterations" name="maxIterations" type="number" defaultValue={editingAgent?.maxIterations || 5} min={1} max={20} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>发布状态</Label>
                    <Select name="isPublished" defaultValue={editingAgent ? String(editingAgent.isPublished) : "true"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">已发布</SelectItem>
                        <SelectItem value="false">未发布</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>关联技能</Label>
                    <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-md border bg-background">
                      {skills.length === 0 ? (
                        <span className="text-xs text-muted-foreground">暂无技能，先去技能管理创建</span>
                      ) : (
                        skills.map((sk) => {
                          const selected = agentSkillIds.includes(sk.id);
                          return (
                            <Badge
                              key={sk.id}
                              variant={selected ? "default" : "outline"}
                              className="cursor-pointer"
                              onClick={() => {
                                setAgentSkillIds((prev) =>
                                  prev.includes(sk.id)
                                    ? prev.filter((id) => id !== sk.id)
                                    : [...prev, sk.id]
                                );
                              }}
                            >
                              {sk.name}
                            </Badge>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">系统提示词</Label>
                  <Textarea id="systemPrompt" name="systemPrompt" defaultValue={editingAgent?.systemPrompt} rows={6} required className="font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="examplePrompts">示例提示词 (JSON 数组)</Label>
                  <Textarea id="examplePrompts" name="examplePrompts" defaultValue={editingAgent?.examplePrompts || "[]"} rows={3} className="font-mono text-sm" />
                </div>
                <Button type="submit" className="w-full">{editingAgent ? "更新" : "创建"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="marketplace">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">技能市场</h2>
            <Button disabled>
              <Globe className="h-4 w-4 mr-2" />GitHub 导入
            </Button>
          </div>
          {marketplaceSkills.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>扫描本地技能目录中...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {marketplaceSkills.map((sk) => {
                const installed = skills.some((s) => s.name.toLowerCase() === sk.name.toLowerCase());
                return (
                  <Card key={sk.name} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{sk.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{sk.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">{sk.category || "general"}</Badge>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={installed || installingSkill === sk.name}
                          onClick={async () => {
                            setInstallingSkill(sk.name);
                            const res = await fetch("/api/skills/import", {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ type: "local", name: sk.name }),
                            });
                            const raw = await res.text();
                            let data: any;
                            try { data = JSON.parse(raw); } catch { data = { error: `服务器 ${res.status}: ${raw.slice(0, 200)}` }; }
                            if (data.imported > 0) {
                              toast.success(`已安装「${sk.name}」`);
                              fetchSkills();
                            } else {
                              toast.error(data.error || data.errors?.[0] || "安装失败");
                            }
                            setInstallingSkill(null);
                          }}
                        >
                          {installed ? "已安装" : installingSkill === sk.name ? "安装中..." : "安装"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="skills">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">技能列表</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { setShowImportDialog(true); setImportResult(null); }}>
                <Upload className="h-4 w-4 mr-2" />导入
              </Button>
              <Button onClick={() => { setEditingSkill(null); setShowSkillDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />新建技能
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {skills.map((skill) => (
              <Card key={skill.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-medium">{skill.name}</span>
                      <Badge variant="outline" className="text-xs">{skill.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{skill.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingSkill(skill); setShowSkillDialog(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSkill(skill.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingSkill ? "编辑技能" : "新建技能"}</DialogTitle></DialogHeader>
              <form onSubmit={saveSkill} className="space-y-4" key={editingSkill?.id || "new-skill"}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sk-name">名称</Label>
                    <Input id="sk-name" name="name" defaultValue={editingSkill?.name} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sk-category">分类</Label>
                    <Input id="sk-category" name="category" defaultValue={editingSkill?.category || "general"} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sk-desc">描述</Label>
                  <Input id="sk-desc" name="description" defaultValue={editingSkill?.description} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sk-tools">允许的工具 (JSON 数组)</Label>
                  <Input id="sk-tools" name="toolsAllowed" defaultValue={editingSkill?.toolsAllowed || "[]"} placeholder='["read_file", "shell_exec"]' />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sk-prompt">系统提示词</Label>
                  <Textarea id="sk-prompt" name="systemPrompt" defaultValue={editingSkill?.systemPrompt} rows={8} required className="font-mono text-sm" />
                </div>
                <Button type="submit" className="w-full">{editingSkill ? "更新" : "创建"}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={showImportDialog} onOpenChange={(v) => { setShowImportDialog(v); if (!v) setImportResult(null); }}>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>导入技能</DialogTitle></DialogHeader>
              <Tabs defaultValue="paste">
                <TabsList className="mb-4">
                  <TabsTrigger value="paste">粘贴内容</TabsTrigger>
                  <TabsTrigger value="upload">上传文件</TabsTrigger>
                  <TabsTrigger value="github">GitHub</TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="space-y-3">
                  <div className="space-y-2">
                    <Label>粘贴 SKILL.md 内容</Label>
                    <Textarea
                      value={pasteContent}
                      onChange={(e) => setPasteContent(e.target.value)}
                      rows={8}
                      placeholder={`粘贴 SKILL.md 文件内容，支持的格式：

---
name: 技能名称
description: 技能描述
tools_allowed: ["read_file"]
---

你是一个...`}
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button className="w-full" disabled={importing || !pasteContent.trim()} onClick={async () => {
                    setImporting(true); setImportResult(null);
                    try {
                      const res = await fetch("/api/skills/import", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "content", items: [{ name: "pasted", content: pasteContent }] }),
                      });
                      const text = await res.text();
                      const data = text ? JSON.parse(text) : { imported: 0, errors: ["服务器无响应"] };
                      setImportResult(data);
                      if (data.imported > 0) { fetchSkills(); setPasteContent(""); }
                    } catch (err: any) { setImportResult({ imported: 0, errors: [err.message] }); }
                    setImporting(false);
                  }}>
                    {importing ? "导入中..." : "导入"}
                  </Button>
                </TabsContent>

                <TabsContent value="upload" className="space-y-3">
                  <div className="space-y-2">
                    <Label>选择文件</Label>
                    <input ref={fileInputRef} type="file" accept=".md,.zip" multiple className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                    <p className="text-xs text-muted-foreground">支持 .md 文件或 .zip 压缩包，含 YAML frontmatter。每个文件独立发送。</p>
                  </div>
                  <Button className="w-full" disabled={importing} onClick={async () => {
                    const files = fileInputRef.current?.files;
                    if (!files || files.length === 0) { toast.error("请选择文件"); return; }
                    setImporting(true); setImportResult(null);

                    let imported = 0;
                    const allErrors: string[] = [];

                    for (const f of Array.from(files)) {
                      try {
                        const b64 = await new Promise<string>((resolve, reject) => {
                          const r = new FileReader();
                          r.onload = () => resolve((r.result as string).split(",")[1]);
                          r.onerror = () => reject(r.error);
                          r.readAsDataURL(f);
                        });

                        const res = await fetch("/api/skills/import", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "base64", filename: f.name, data: b64 }),
                        });

                        const text = await res.text();
                        let data: any;
                        try { data = JSON.parse(text); } catch { data = { imported: 0, errors: [`服务器 ${res.status}: ${text.slice(0, 100)}`] }; }
                        imported += data.imported || 0;
                        if (data.errors) allErrors.push(...data.errors.map((e: string) => `${f.name}: ${e}`));
                      } catch (err: any) {
                        allErrors.push(`${f.name}: ${err.message}`);
                      }
                    }

                    setImportResult({ imported, errors: allErrors });
                    if (imported > 0) fetchSkills();
                    setImporting(false);
                  }}>
                    {importing ? "导入中..." : "上传并导入"}
                  </Button>
                </TabsContent>

                <TabsContent value="github" className="space-y-3">
                  <div className="space-y-2">
                    <Label>GitHub 仓库链接</Label>
                    <Input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/user/repo" />
                  </div>
                  <Button className="w-full" disabled={importing || !githubUrl.trim()} onClick={async () => {
                    setImporting(true); setImportResult(null);
                    try {
                      const res = await fetch("/api/skills/import", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ type: "github", repoUrl: githubUrl.trim() }),
                      });
                      const text = await res.text();
                      const data = text ? JSON.parse(text) : { imported: 0, errors: ["服务器无响应"] };
                      setImportResult(data);
                      if (data.imported > 0) fetchSkills();
                    } catch (err: any) { setImportResult({ imported: 0, errors: [err.message] }); }
                    setImporting(false);
                  }}>
                    <Globe className="h-4 w-4 mr-1" />导入
                  </Button>
                </TabsContent>
              </Tabs>

              {importResult && (
                <div className="text-sm pt-2 border-t">
                  <p className="text-emerald-600">成功导入 {importResult.imported} 个技能</p>
                  {importResult.errors.length > 0 && (
                    <ul className="text-destructive text-xs mt-1 space-y-0.5">
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="users">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">用户列表</h2>
            <Button onClick={() => setShowUserDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />新建用户
            </Button>
          </div>
          <div className="space-y-2">
            {users.map((user) => (
              <Card key={user.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <span className="font-medium">{user.name}</span>
                    <span className="text-muted-foreground ml-2">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role === "admin" ? "管理员" : "用户"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
            <DialogContent>
              <DialogHeader><DialogTitle>新建用户</DialogTitle></DialogHeader>
              <form onSubmit={createUser} className="space-y-4">
                <div className="space-y-2">
                  <Label>邮箱</Label>
                  <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>姓名</Label>
                  <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>密码</Label>
                  <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={6} />
                </div>
                <div className="space-y-2">
                  <Label>角色</Label>
                  <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v || "user" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">普通用户</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">创建</Button>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
