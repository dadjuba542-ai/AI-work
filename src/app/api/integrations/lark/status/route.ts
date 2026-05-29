import { auth } from "@/auth";
import { getLarkIntegrationStatus, getLarkTenantToken } from "@/lib/integrations/lark";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const status = await getLarkIntegrationStatus();
  if (!status.configured) return Response.json({ ...status, reachable: false });

  try {
    await getLarkTenantToken();
    return Response.json({ ...status, reachable: true });
  } catch (err: unknown) {
    return Response.json({ ...status, reachable: false, error: err instanceof Error ? err.message : "token 获取失败" });
  }
}
