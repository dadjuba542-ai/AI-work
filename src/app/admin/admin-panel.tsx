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
  reviewStatus: string;
  createdBy: string;
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

type ToolMonitor = {
  windowDays: number;
  summary: {
    totalCalls: number;
    failedCalls: number;
    successRate: number;
    activeTools: number;
    definedTools: number;
    retryableFailures: number;
  };
  capabilities: Array<{ name: string; hasHandler: boolean }>;
  tools: Array<{
    name: string;
    total: number;
    success: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    lastCalledAt: string | null;
    lastError: string | null;
  }>;
  recent: Array<{
    at: string;
    name: string;
    ok: boolean;
    durationMs: number;
    outputPreview: string;
    errorType?: string;
    requestId?: string;
    retryable?: boolean;
  }>;
  trend24h: Array<{
    hour: string;
    total: number;
    failed: number;
  }>;
  topErrors: Array<{
    tool: string;
    errorType: string;
    count: number;
    sample: string;
  }>;
};

type MarketplaceSkill = {
  name: string;
  description: string;
  category?: string;
};

type ImportResponse = {
  imported: number;
  errors: string[];
  error?: string;
};

type ApiError = {
  error?: string;
};

type AdminAssistantSnapshot = {
  generatedAt: string;
  scope: string;
  summary: {
    totalCalls: number;
    failedCalls: number;
    successRate: number;
    p95DurationMs: number;
    avgDurationMs: number;
  };
  topErrors: Array<{ tool: string; errorType: string; count: number; sample: string }>;
  recentFailures: Array<{ at: string; tool: string; errorType: string; output: string }>;
  system: {
    users: number;
    admins: number;
    agents: number;
    hasLlmKey: boolean;
    hasVisionKey: boolean;
    visionModel: string;
  };
};

type KbDocument = {
  id: string;
  title: string;
  productId: string;
  status: string;
  version: string;
  sensitivity: string;
  originalFilename: string;
  createdAt: string;
  indexedAt?: string | null;
};

type KbIndexJob = {
  id: string;
  documentId: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function AdminPanel() {
  const [tab, setTab] = useState("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("https://api.minimaxi.com");
  const [visionKey, setVisionKey] = useState("");
  const [visionModel, setVisionModel] = useState("mimo-v2.5");
  const [larkAppId, setLarkAppId] = useState("");
  const [larkAppSecret, setLarkAppSecret] = useState("");
  const [larkChecking, setLarkChecking] = useState(false);
  const [larkStatusText, setLarkStatusText] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", role: "user" });
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [toolMonitor, setToolMonitor] = useState<ToolMonitor | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [marketplaceSkills, setMarketplaceSkills] = useState<MarketplaceSkill[]>([]);
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [showSkillFilesDialog, setShowSkillFilesDialog] = useState(false);
  const [skillFilesTitle, setSkillFilesTitle] = useState("");
  const [skillFilesTree, setSkillFilesTree] = useState("");
  const [loadingSkillFiles, setLoadingSkillFiles] = useState(false);
  const [agentSkillIds, setAgentSkillIds] = useState<string[]>([]);

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantSnapshot, setAssistantSnapshot] = useState<AdminAssistantSnapshot | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketMarkdown, setTicketMarkdown] = useState("");
  const [kbProductId, setKbProductId] = useState("general");
  const [kbVersion, setKbVersion] = useState("v1");
  const [kbSensitivity, setKbSensitivity] = useState("internal");
  const [kbUploading, setKbUploading] = useState(false);
  const [kbDocsLoading, setKbDocsLoading] = useState(false);
  const [kbDocs, setKbDocs] = useState<KbDocument[]>([]);
  const [kbJobs, setKbJobs] = useState<Record<string, KbIndexJob>>({});
  const kbFileRef = useRef<HTMLInputElement>(null);

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
      setVisionKey(data.vision_api_key || "");
      setVisionModel(data.vision_model || "mimo-v2.5");
      setLarkAppId(data.lark_app_id || "");
      setLarkAppSecret(data.lark_app_secret || "");
    }
  }, []);

  const fetchMarketplace = useCallback(async () => {
    const res = await fetch("/api/skills/marketplace");
    if (res.ok) setMarketplaceSkills(await safeJson<MarketplaceSkill[]>(res));
  }, []);

  const fetchSkills = useCallback(async () => {
    const res = await fetch("/api/skills");
    if (res.ok) setSkills(await safeJson<Skill[]>(res));
    await fetchMarketplace();
  }, [fetchMarketplace]);

  const fetchToolMonitor = useCallback(async () => {
    setMonitorLoading(true);
    const res = await fetch("/api/admin/tool-monitor?days=7");
    if (res.ok) setToolMonitor(await safeJson<ToolMonitor>(res));
    setMonitorLoading(false);
  }, []);

  const fetchKbDocuments = useCallback(async () => {
    setKbDocsLoading(true);
    try {
      const res = await fetch(`/api/kb/documents?productId=${encodeURIComponent(kbProductId)}`);
      if (!res.ok) {
        const err = await safeJson<ApiError>(res);
        toast.error(err.error || "读取知识库文档失败");
        return;
      }
      const data = await safeJson<{ items: KbDocument[] }>(res);
      setKbDocs(data.items || []);
    } finally {
      setKbDocsLoading(false);
    }
  }, [kbProductId]);

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchAgents(), fetchUsers(), loadSettings(), fetchSkills(), fetchMarketplace()]);
    };
    void init();
  }, [fetchAgents, fetchUsers, loadSettings, fetchSkills, fetchMarketplace]);

  useEffect(() => {
    if (tab === "tool-monitor" && !toolMonitor && !monitorLoading) {
      queueMicrotask(() => {
        void fetchToolMonitor();
      });
    }
  }, [tab, toolMonitor, monitorLoading, fetchToolMonitor]);

  useEffect(() => {
    if (tab === "kb") {
      queueMicrotask(() => {
        void fetchKbDocuments();
      });
    }
  }, [tab, fetchKbDocuments]);

  async function saveApiKey(e: React.FormEvent) {
    e.preventDefault();
    setSavingKey(true);
    const normalized = apiBase.replace(/\/v1\/chat\/completions\/?$/, "").replace(/\/v1\/?$/, "");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_api_key: apiKey,
        llm_base_url: normalized,
        vision_api_key: visionKey,
        vision_model: visionModel,
        lark_app_id: larkAppId,
        lark_app_secret: larkAppSecret,
      }),
    });
    if (res.ok) {
      toast.success("API 配置已保存");
    } else {
      toast.error("保存失败");
    }
    setSavingKey(false);
  }

  async function checkLarkStatus() {
    setLarkChecking(true);
    setLarkStatusText("");
    try {
      const res = await fetch("/api/integrations/lark/status");
      const data = await safeJson<{ configured?: boolean; reachable?: boolean; error?: string }>(res);
      if (!res.ok) {
        setLarkStatusText(data.error || "检查失败");
      } else if (!data.configured) {
        setLarkStatusText("未配置飞书 App ID / Secret");
      } else if (data.reachable) {
        setLarkStatusText("连通正常");
      } else {
        setLarkStatusText(`连通失败: ${data.error || "token 获取失败"}`);
      }
    } finally {
      setLarkChecking(false);
    }
  }

  async function saveAgent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: Record<string, string | boolean> = {};
    form.forEach((v, k) => {
      if (k === "isPublished") data[k] = v === "true";
      else data[k] = String(v);
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
    const data: Record<string, string> = {};
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
      const err = await safeJson<ApiError>(res);
      toast.error(err.error || "删除失败");
    }
  }

  async function previewSkillFiles(skill: Skill) {
    setLoadingSkillFiles(true);
    setSkillFilesTitle(skill.name);
    setSkillFilesTree("");
    setShowSkillFilesDialog(true);
    const res = await fetch(`/api/skills/${skill.id}/files`);
    if (res.ok) {
      const data = await safeJson<{ tree?: string }>(res);
      setSkillFilesTree(data.tree || "(empty)");
    } else {
      const err = await safeJson<ApiError>(res);
      setSkillFilesTree(err.error || "读取失败");
    }
    setLoadingSkillFiles(false);
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
      const err = await safeJson<ApiError>(res);
      toast.error(err.error || "创建失败");
    }
  }

  async function handleKbUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setKbUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("productId", kbProductId);
      form.append("version", kbVersion);
      form.append("sensitivity", kbSensitivity);
      const res = await fetch("/api/kb/upload", { method: "POST", body: form });
      if (!res.ok) {
        const err = await safeJson<ApiError>(res);
        toast.error(err.error || "上传失败");
        return;
      }
      toast.success("资料已上传");
      await fetchKbDocuments();
    } finally {
      setKbUploading(false);
    }
  }

  async function pollKbJob(jobId: string) {
    const maxRounds = 30;
    for (let i = 0; i < maxRounds; i++) {
      const res = await fetch(`/api/kb/index-jobs/${jobId}`);
      if (!res.ok) break;
      const job = await safeJson<KbIndexJob>(res);
      setKbJobs((prev) => ({ ...prev, [jobId]: job }));
      if (job.status === "success" || job.status === "failed") {
        await fetchKbDocuments();
        if (job.status === "success") toast.success("索引完成");
        else toast.error(job.errorMessage || "索引失败");
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async function startKbIndex(documentId: string) {
    const res = await fetch(`/api/kb/documents/${documentId}/index`, { method: "POST" });
    if (!res.ok) {
      const err = await safeJson<ApiError>(res);
      toast.error(err.error || "启动索引失败");
      return;
    }
    const data = await safeJson<{ jobId: string }>(res);
    toast.success("已创建索引任务");
    pollKbJob(data.jobId).catch(() => undefined);
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-1">管理后台</h1>
        <p className="text-muted-foreground text-sm">管理 Agents、技能、用户和系统配置</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Key className="h-4 w-4 text-primary" />
              </div>
              统一 API 配置
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveApiKey} className="flex gap-3 items-end flex-wrap">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label htmlFor="api-key" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入 MiniMax API Key"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5 min-w-[200px]">
                <Label htmlFor="api-base" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">接口地址</Label>
                <Input
                  id="api-base"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  className="h-10"
                />
              </div>
              <Button type="submit" disabled={savingKey} className="h-10">
                {savingKey ? "保存中..." : "保存"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Eye className="h-4 w-4 text-primary" />
              </div>
              识图 API（MIMO）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveApiKey} className="flex gap-3 items-end flex-wrap">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label htmlFor="vision-key" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">MIMO API Key</Label>
                <Input
                  id="vision-key"
                  type="password"
                  value={visionKey}
                  onChange={(e) => setVisionKey(e.target.value)}
                  placeholder="mimo-..."
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5 min-w-[140px]">
                <Label htmlFor="vision-model" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">模型</Label>
                <Input
                  id="vision-model"
                  value={visionModel}
                  onChange={(e) => setVisionModel(e.target.value)}
                  placeholder="gemini-2.0-flash-exp"
                  className="h-10"
                />
              </div>
              <Button type="submit" disabled={savingKey} className="h-10">
                {savingKey ? "保存中..." : "保存"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">仅用于识别图片内容，回答由 MiniMax 生成。免费额度 1500次/天。</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-8">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              飞书集成配置
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5 min-w-[260px]">
                <Label htmlFor="lark-app-id" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lark App ID</Label>
                <Input id="lark-app-id" value={larkAppId} onChange={(e) => setLarkAppId(e.target.value)} placeholder="cli_xxx" className="h-10" />
              </div>
              <div className="space-y-1.5 min-w-[320px] flex-1">
                <Label htmlFor="lark-app-secret" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lark App Secret</Label>
                <Input id="lark-app-secret" type="password" value={larkAppSecret} onChange={(e) => setLarkAppSecret(e.target.value)} placeholder="输入飞书应用密钥" className="h-10" />
              </div>
              <Button type="button" variant="outline" onClick={checkLarkStatus} disabled={larkChecking} className="h-10">
                {larkChecking ? "检查中..." : "检查连通性"}
              </Button>
            </div>
            {larkStatusText && <p className="mt-3 text-xs text-muted-foreground">{larkStatusText}</p>}
            <p className="mt-2 text-xs text-muted-foreground">保存按钮沿用上方“统一 API 配置”卡片，保存后即可启用文案工作台的导入飞书、导出飞书、发送飞书。</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-7 bg-muted/70 p-1.5 h-14 rounded-xl">
          <TabsTrigger value="agents" className="text-base font-medium px-3 h-10 leading-none">Agent 管理</TabsTrigger>
          <TabsTrigger value="marketplace" className="text-base font-medium px-3 h-10 leading-none">技能市场</TabsTrigger>
          <TabsTrigger value="skills" className="text-base font-medium px-3 h-10 leading-none">已安装技能</TabsTrigger>
          <TabsTrigger value="tool-monitor" className="text-base font-medium px-3 h-10 leading-none">工具监控</TabsTrigger>
          <TabsTrigger value="assistant" className="text-base font-medium px-3 h-10 leading-none">管理助手</TabsTrigger>
          <TabsTrigger value="kb" className="text-base font-medium px-3 h-10 leading-none">知识库（RAG）</TabsTrigger>
          <TabsTrigger value="review" className="text-base font-medium px-3 h-10 leading-none">审核管理</TabsTrigger>
          <TabsTrigger value="users" className="text-base font-medium px-3 h-10 leading-none">用户管理</TabsTrigger>
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
              <Card key={agent.id} className="border-border/60 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
                <CardContent className="flex items-center justify-between py-3.5 px-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-sm">{agent.name}</span>
                      <Badge variant="outline" className="text-[11px] font-medium">{agent.category}</Badge>
                      {!agent.isPublished && <Badge variant="secondary" className="text-[11px]">未发布</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{agent.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleAgent(agent.id, agent.isPublished)} title={agent.isPublished ? "下线" : "发布"}>
                      {agent.isPublished ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingAgent(agent); setShowAgentDialog(true); }}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteAgent(agent.id)}>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketplaceSkills.map((sk) => {
                const installed = skills.some((s) => s.name.toLowerCase() === sk.name.toLowerCase());
                return (
                  <Card key={sk.name} className="border-border/60 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-sm">{sk.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{sk.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[11px] font-medium">{sk.category || "general"}</Badge>
                        <Button
                          size="sm"
                          className="h-8 text-xs font-medium"
                          disabled={installed || installingSkill === sk.name}
                          onClick={async () => {
                            setInstallingSkill(sk.name);
                            const res = await fetch("/api/skills/import", {
                              method: "POST", headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ type: "local", name: sk.name }),
                            });
                            const raw = await res.text();
                            let data: ImportResponse;
                            try {
                              data = JSON.parse(raw) as ImportResponse;
                            } catch {
                              data = { imported: 0, errors: [], error: `服务器 ${res.status}: ${raw.slice(0, 200)}` };
                            }
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
              <Card key={skill.id} className="border-border/60 hover:border-primary/20 hover:shadow-sm transition-all duration-200">
                <CardContent className="flex items-center justify-between py-3.5 px-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1 rounded-md bg-primary/10">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="font-semibold text-sm">{skill.name}</span>
                      <Badge variant="outline" className="text-[11px] font-medium">{skill.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{skill.description}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => previewSkillFiles(skill)} title="查看文件树">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingSkill(skill); setShowSkillDialog(true); }}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteSkill(skill.id)}>
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

          <Dialog open={showSkillFilesDialog} onOpenChange={setShowSkillFilesDialog}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>文件树预览：{skillFilesTitle}</DialogTitle></DialogHeader>
              {loadingSkillFiles ? (
                <p className="text-sm text-muted-foreground">加载中...</p>
              ) : (
                <pre className="text-xs leading-5 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 overflow-auto">
                  {skillFilesTree || "(empty)"}
                </pre>
              )}
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
                      const data = text ? (JSON.parse(text) as ImportResponse) : { imported: 0, errors: ["服务器无响应"] };
                      setImportResult(data);
                      if (data.imported > 0) { fetchSkills(); setPasteContent(""); }
                    } catch (err: unknown) {
                      setImportResult({ imported: 0, errors: [err instanceof Error ? err.message : "导入失败"] });
                    }
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
                        let data: ImportResponse;
                        try {
                          data = JSON.parse(text) as ImportResponse;
                        } catch {
                          data = { imported: 0, errors: [`服务器 ${res.status}: ${text.slice(0, 100)}`] };
                        }
                        imported += data.imported || 0;
                        if (data.errors) allErrors.push(...data.errors.map((e: string) => `${f.name}: ${e}`));
                      } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : "上传失败";
                        allErrors.push(`${f.name}: ${message}`);
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
                      const data = text ? (JSON.parse(text) as ImportResponse) : { imported: 0, errors: ["服务器无响应"] };
                      setImportResult(data);
                      if (data.imported > 0) fetchSkills();
                    } catch (err: unknown) {
                      setImportResult({ imported: 0, errors: [err instanceof Error ? err.message : "导入失败"] });
                    }
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

        <TabsContent value="tool-monitor">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">工具调用监控（近 7 天）</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => window.open("/api/admin/tool-monitor?days=7&format=csv&failedOnly=1", "_blank")}
              >
                导出失败 CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open("/api/admin/tool-monitor?days=7&format=csv", "_blank")}
              >
                导出全部 CSV
              </Button>
              <Button variant="outline" onClick={fetchToolMonitor} disabled={monitorLoading}>
                {monitorLoading ? "刷新中..." : "刷新"}
              </Button>
            </div>
          </div>

          {!toolMonitor ? (
            <Card><CardContent className="py-8 text-sm text-muted-foreground">暂无监控数据</CardContent></Card>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">总调用</p><p className="text-xl font-semibold">{toolMonitor.summary.totalCalls}</p></CardContent></Card>
                <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">失败调用</p><p className="text-xl font-semibold text-destructive">{toolMonitor.summary.failedCalls}</p></CardContent></Card>
                <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">成功率</p><p className="text-xl font-semibold">{toolMonitor.summary.successRate}%</p></CardContent></Card>
                <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">活跃工具</p><p className="text-xl font-semibold">{toolMonitor.summary.activeTools}</p></CardContent></Card>
                <Card><CardContent className="py-4"><p className="text-xs text-muted-foreground">已定义工具</p><p className="text-xl font-semibold">{toolMonitor.summary.definedTools}</p></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">近 24 小时趋势</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(toolMonitor.trend24h || []).map((t) => (
                      <div key={t.hour} className="flex items-center justify-between text-xs border rounded px-2.5 py-1.5">
                        <span className="text-muted-foreground">{t.hour}</span>
                        <span>总 {t.total} / 失败 <span className="text-destructive">{t.failed}</span></span>
                      </div>
                    ))}
                    {(toolMonitor.trend24h || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">暂无趋势数据</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Top 失败原因</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {(toolMonitor.topErrors || []).map((e, idx) => (
                      <div key={`${e.tool}-${e.errorType}-${idx}`} className="border rounded px-2.5 py-2">
                        <p className="text-sm font-medium">{e.tool} · {e.errorType}</p>
                        <p className="text-xs text-muted-foreground mt-1">出现 {e.count} 次</p>
                        <p className="text-xs mt-1 truncate">{e.sample}</p>
                      </div>
                    ))}
                    {(toolMonitor.topErrors || []).length === 0 && (
                      <p className="text-sm text-muted-foreground">暂无失败原因数据</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">工具能力快照</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {toolMonitor.capabilities.map((c) => (
                    <Badge key={c.name} variant={c.hasHandler ? "default" : "destructive"}>{c.name}</Badge>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">按工具统计</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {toolMonitor.tools.map((t) => (
                    <div key={t.name} className="border rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground">调用 {t.total} 次</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        成功率 {t.successRate}% ｜ 平均耗时 {t.avgDurationMs}ms ｜ P95 {t.p95DurationMs}ms
                      </p>
                      {t.lastError && <p className="text-xs text-destructive mt-1 truncate">最近错误：{t.lastError}</p>}
                    </div>
                  ))}
                  {toolMonitor.tools.length === 0 && (
                    <p className="text-sm text-muted-foreground">暂无工具调用记录</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">最近调用</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {toolMonitor.recent.map((r, idx) => (
                    <div key={`${r.at}-${r.name}-${idx}`} className="border rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{r.name}</p>
                        <Badge variant={r.ok ? "default" : "destructive"}>{r.ok ? "成功" : "失败"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(r.at).toLocaleString("zh-CN")} ｜ {r.durationMs}ms
                      </p>
                      {!r.ok && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {r.errorType || "UNKNOWN"} ｜ {r.retryable ? "可重试" : "不可重试"}
                        </p>
                      )}
                      <p className="text-xs mt-1 truncate">{r.outputPreview || "(no output)"}</p>
                    </div>
                  ))}
                  {toolMonitor.recent.length === 0 && (
                    <p className="text-sm text-muted-foreground">暂无最近调用数据</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="assistant">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">管理员 AI 助手</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  助手会自动读取后台关键快照（工具失败、Top错误、最近报错、系统配置完整性）后给出分析与修复建议。
                </p>
                <Textarea
                  rows={4}
                  placeholder="例如：过去24小时失败率升高的主要原因是什么？先给结论，再给修复优先级。"
                  value={assistantPrompt}
                  onChange={(e) => setAssistantPrompt(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={async () => {
                      if (!assistantPrompt.trim()) {
                        toast.error("请输入问题");
                        return;
                      }
                      setAssistantLoading(true);
                      try {
                        const res = await fetch("/api/admin/assistant", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ prompt: assistantPrompt.trim() }),
                        });
                        const data = await safeJson<{ answer?: string; snapshot?: AdminAssistantSnapshot; error?: string }>(res);
                        if (!res.ok) {
                          toast.error(data.error || "请求失败");
                          return;
                        }
                        setAssistantAnswer(data.answer || "");
                        setAssistantSnapshot(data.snapshot || null);
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : "请求失败");
                      } finally {
                        setAssistantLoading(false);
                      }
                    }}
                    disabled={assistantLoading}
                  >
                    {assistantLoading ? "分析中..." : "开始分析"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={ticketLoading || !assistantAnswer || !assistantSnapshot}
                    onClick={async () => {
                      if (!assistantAnswer || !assistantSnapshot) return;
                      setTicketLoading(true);
                      try {
                        const res = await fetch("/api/admin/assistant/ticket", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            question: assistantPrompt,
                            answer: assistantAnswer,
                            snapshot: assistantSnapshot,
                          }),
                        });
                        const data = await safeJson<{ markdown?: string; error?: string }>(res);
                        if (!res.ok) {
                          toast.error(data.error || "生成工单失败");
                          return;
                        }
                        setTicketMarkdown(data.markdown || "");
                        toast.success("修复工单已生成");
                      } catch (err: unknown) {
                        toast.error(err instanceof Error ? err.message : "生成工单失败");
                      } finally {
                        setTicketLoading(false);
                      }
                    }}
                  >
                    {ticketLoading ? "生成中..." : "生成修复工单"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {assistantAnswer && (
              <Card>
                <CardHeader><CardTitle className="text-base">助手结论</CardTitle></CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm leading-6">{assistantAnswer}</div>
                </CardContent>
              </Card>
            )}

            {assistantSnapshot && (
              <Card>
                <CardHeader><CardTitle className="text-base">分析快照</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>时间：{new Date(assistantSnapshot.generatedAt).toLocaleString("zh-CN")}</p>
                  <p>
                    调用：{assistantSnapshot.summary.totalCalls}，失败：{assistantSnapshot.summary.failedCalls}，成功率：{assistantSnapshot.summary.successRate}%
                  </p>
                  <p>
                    耗时：平均 {assistantSnapshot.summary.avgDurationMs}ms，P95 {assistantSnapshot.summary.p95DurationMs}ms
                  </p>
                </CardContent>
              </Card>
            )}

            {ticketMarkdown && (
              <Card>
                <CardHeader><CardTitle className="text-base">修复工单（交付 Coding Agent）</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <pre className="text-xs leading-5 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 overflow-auto">
                    {ticketMarkdown}
                  </pre>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(ticketMarkdown);
                          toast.success("工单已复制");
                        } catch {
                          toast.error("复制失败");
                        }
                      }}
                    >
                      复制工单
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="kb">
          <Card className="border-border/60 shadow-sm mb-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">资料入库</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="kb-product">产品ID</Label>
                  <Input id="kb-product" value={kbProductId} onChange={(e) => setKbProductId(e.target.value || "general")} className="h-9 w-44" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-version">版本</Label>
                  <Input id="kb-version" value={kbVersion} onChange={(e) => setKbVersion(e.target.value || "v1")} className="h-9 w-28" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kb-sensitivity">敏感级别</Label>
                  <Select value={kbSensitivity} onValueChange={setKbSensitivity}>
                    <SelectTrigger id="kb-sensitivity" className="h-9 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">public</SelectItem>
                      <SelectItem value="internal">internal</SelectItem>
                      <SelectItem value="restricted">restricted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <input ref={kbFileRef} type="file" accept=".docx,.pdf,.txt,.md,.xlsx,.xls,.pptx" className="hidden" onChange={handleKbUpload} />
                <Button onClick={() => kbFileRef.current?.click()} disabled={kbUploading}>
                  <Upload className="h-4 w-4 mr-2" />{kbUploading ? "上传中..." : "上传资料"}
                </Button>
                <Button variant="outline" onClick={fetchKbDocuments} disabled={kbDocsLoading}>
                  {kbDocsLoading ? "刷新中..." : "刷新列表"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">支持上传后按文档手动发起索引，索引任务会自动轮询状态。</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">文档与索引任务</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {kbDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无资料，先上传一份产品文档。</p>
                ) : kbDocs.map((doc) => {
                  const runningJob = Object.values(kbJobs).find((j) => j.documentId === doc.id && (j.status === "pending" || j.status === "running"));
                  const latestJob = Object.values(kbJobs).find((j) => j.documentId === doc.id);
                  return (
                    <Card key={doc.id} className="border-border/60">
                      <CardContent className="py-3 px-4 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{doc.title}</span>
                            <Badge variant="outline">{doc.status}</Badge>
                            <Badge variant="secondary">{doc.version}</Badge>
                            <Badge variant="secondary">{doc.sensitivity}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">product: {doc.productId} · 上传: {new Date(doc.createdAt).toLocaleString()}</p>
                          {latestJob && (
                            <p className="text-xs text-muted-foreground mt-1">
                              任务: {latestJob.status} {latestJob.status === "running" || latestJob.status === "pending" ? `(${latestJob.progress}%)` : ""}
                              {latestJob.errorMessage ? ` · ${latestJob.errorMessage}` : ""}
                            </p>
                          )}
                        </div>
                        <Button onClick={() => startKbIndex(doc.id)} disabled={!!runningJob} size="sm">
                          {runningJob ? "索引中..." : "发起索引"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Agent 审核</h2>
          </div>
          <PendingReviewList onReviewed={() => fetchAgents()} />
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
              <Card key={user.id} className="border-border/60 hover:border-primary/20 transition-all duration-200">
                <CardContent className="flex items-center justify-between py-3.5 px-5">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {user.name?.slice(0, 2) || "U"}
                    </div>
                    <div>
                      <span className="font-semibold text-sm">{user.name}</span>
                      <span className="text-muted-foreground ml-2 text-sm">{user.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={user.role === "admin" ? "default" : "secondary"} className="text-[11px] font-medium">
                      {user.role === "admin" ? "管理员" : "用户"}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
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
                  <Label>账号</Label>
                  <Input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
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

function PendingReviewList({ onReviewed }: { onReviewed: () => void }) {
  const [pending, setPending] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agents").then(async (res) => {
      if (res.ok) {
        const all = await safeJson<Agent[]>(res);
        setPending(all.filter((a) => a.reviewStatus === "pending"));
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">加载中...</div>;

  if (pending.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">暂无待审核的 Agent</p>
      </div>
    );
  }

  async function handleReview(id: string, action: "approve" | "reject") {
    setActing(id);
    try {
      const res = await fetch(`/api/agents/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("操作失败");
      setPending((prev) => prev.filter((a) => a.id !== id));
      onReviewed();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="space-y-3">
      {pending.map((a) => (
        <Card key={a.id} className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-sm">{a.name}</h3>
                  <Badge variant="secondary" className="text-[10px] font-normal">{a.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{a.description}</p>
                <p className="text-[11px] text-muted-foreground/60">创建者: {a.createdBy?.slice(0, 8)}...</p>
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleReview(a.id, "reject")} disabled={acting === a.id}>
                  驳回
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={() => handleReview(a.id, "approve")} disabled={acting === a.id}>
                  {acting === a.id ? "处理中..." : "通过"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
