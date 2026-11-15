import { database } from "@/shared/server/db";
import { readConfig } from "@/shared/server/config";
import { secureEqual } from "@/shared/server/http";
import { readiness } from "@/shared/server/health";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!secureEqual(request.headers.get("x-health-token") ?? "", readConfig().TRUSTED_PROXY_KEY)) return new Response(null, { status: 404 });
    const ok = await readiness(database());
    return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
