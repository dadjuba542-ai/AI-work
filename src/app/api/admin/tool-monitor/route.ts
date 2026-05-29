import { auth } from "@/auth";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { and, gte, isNotNull } from "drizzle-orm";
import { getToolHandler, getToolList } from "@/lib/tools";

type ToolCallEvent = {
  id: string;
  name: string;
  input: string;
  output: string;
  ok: boolean;
  durationMs: number;
  requestId?: string;
  errorType?: string;
  retryable?: boolean;
  attempt?: number;
};

type ToolStats = {
  name: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastCalledAt: string | null;
  lastError: string | null;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session || (session.user as { id: string; role?: string }).role !== "admin") {
    return Response.json({ error: "无权限" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const daysRaw = Number(searchParams.get("days") || 7);
  const days = Number.isFinite(daysRaw) ? Math.min(30, Math.max(1, daysRaw)) : 7;
  const format = (searchParams.get("format") || "json").toLowerCase();
  const failedOnly = searchParams.get("failedOnly") === "1";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = db
    .select({ createdAt: messages.createdAt, toolExecutions: messages.toolExecutions })
    .from(messages)
    .where(and(isNotNull(messages.toolExecutions), gte(messages.createdAt, since)))
    .all();

  const byTool = new Map<string, ToolStats & { durations: number[] }>();
  const byError = new Map<string, { key: string; count: number; sample: string }>();
  const byHour24 = new Map<string, { hour: string; total: number; failed: number }>();
  const recent: Array<{
    at: string;
    name: string;
    ok: boolean;
    durationMs: number;
      outputPreview: string;
      errorType?: string;
      requestId?: string;
      retryable?: boolean;
  }> = [];

  for (const row of rows) {
    if (!row.toolExecutions) continue;
    let parsed: ToolCallEvent[] = [];
    try {
      parsed = JSON.parse(row.toolExecutions);
      if (!Array.isArray(parsed)) continue;
    } catch {
      continue;
    }

    for (const evt of parsed) {
      const name = evt?.name || "unknown";
      const stat = byTool.get(name) || {
        name,
        total: 0,
        success: 0,
        failed: 0,
        successRate: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        lastCalledAt: null,
        lastError: null,
        durations: [],
      };

      stat.total += 1;
      if (evt.ok) stat.success += 1;
      else {
        stat.failed += 1;
        stat.lastError = evt.output?.slice(0, 200) || "(empty error)";
      }
      const dur = Number(evt.durationMs) || 0;
      stat.durations.push(dur);
      stat.lastCalledAt = row.createdAt;
      byTool.set(name, stat);
      const at = new Date(row.createdAt);
      const hourKey = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")} ${String(at.getUTCHours()).padStart(2, "0")}:00Z`;
      const hourStat = byHour24.get(hourKey) || { hour: hourKey, total: 0, failed: 0 };
      hourStat.total += 1;
      if (!evt.ok) hourStat.failed += 1;
      byHour24.set(hourKey, hourStat);
      if (!evt.ok) {
        const errType = evt.errorType || "UNKNOWN";
        const key = `${name}::${errType}`;
        const item = byError.get(key) || { key, count: 0, sample: (evt.output || "").slice(0, 160) };
        item.count += 1;
        byError.set(key, item);
      }

      const recentRow = {
        at: row.createdAt,
        name,
        ok: !!evt.ok,
        durationMs: dur,
        outputPreview: (evt.output || "").slice(0, 160),
        errorType: evt.errorType,
        requestId: evt.requestId,
        retryable: !!evt.retryable,
      };
      if (!failedOnly || !recentRow.ok) recent.push(recentRow);
    }
  }

  const toolStats: ToolStats[] = [...byTool.values()].map((s) => ({
    name: s.name,
    total: s.total,
    success: s.success,
    failed: s.failed,
    successRate: s.total > 0 ? Number(((s.success / s.total) * 100).toFixed(1)) : 0,
    avgDurationMs: s.durations.length > 0 ? Math.round(s.durations.reduce((a, b) => a + b, 0) / s.durations.length) : 0,
    p95DurationMs: Math.round(percentile(s.durations, 95)),
    lastCalledAt: s.lastCalledAt,
    lastError: s.lastError,
  }));

  toolStats.sort((a, b) => b.total - a.total);
  recent.sort((a, b) => (a.at > b.at ? -1 : 1));

  if (format === "csv") {
    const csvRows: string[] = [];
    csvRows.push("time,tool,ok,duration_ms,output_preview");
    for (const r of recent) {
      const escaped = r.outputPreview.replaceAll('"', '""').replace(/\r?\n/g, " ");
      csvRows.push(`${r.at},${r.name},${r.ok ? "1" : "0"},${r.durationMs},"${escaped}"`);
    }
    const filename = failedOnly
      ? `tool-failures-${days}d.csv`
      : `tool-calls-${days}d.csv`;
    return new Response(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const definedTools = getToolList().map((t) => t.function.name);
  const capabilities = definedTools.map((name) => ({
    name,
    hasHandler: !!getToolHandler(name),
  }));

  const totalCalls = toolStats.reduce((sum, t) => sum + t.total, 0);
  const totalFailed = toolStats.reduce((sum, t) => sum + t.failed, 0);
  const retryableFailures = recent.filter((r) => !r.ok && r.retryable).length;
  const trend24h = [...byHour24.values()]
    .sort((a, b) => (a.hour > b.hour ? 1 : -1))
    .slice(-24);
  const topErrors = [...byError.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((e) => {
      const [tool, errorType] = e.key.split("::");
      return { tool, errorType, count: e.count, sample: e.sample };
    });

  return Response.json({
    windowDays: days,
    summary: {
      totalCalls,
      failedCalls: totalFailed,
      successRate: totalCalls > 0 ? Number((((totalCalls - totalFailed) / totalCalls) * 100).toFixed(1)) : 100,
      activeTools: toolStats.length,
      definedTools: definedTools.length,
      retryableFailures,
    },
    capabilities,
    tools: toolStats,
    trend24h,
    topErrors,
    recent: recent.slice(0, 40),
  });
}
