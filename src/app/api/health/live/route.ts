export const GET = () => Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
