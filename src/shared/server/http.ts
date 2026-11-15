import "server-only";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { parseTree, type Node as JsonNode, type ParseError } from "jsonc-parser";
import { NextResponse } from "next/server";
import { AppError, safeError } from "./errors";
import type { ServerConfig } from "./config";

export const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function enforceTransport(request: Request, config: ServerConfig): string {
  if (!secureEqual(request.headers.get("x-puls-proxy-key") ?? "", config.TRUSTED_PROXY_KEY) || request.headers.get("x-forwarded-proto") !== "https")
    throw new AppError(403, "ACCESS_FORBIDDEN", "Используйте защищённый адрес приложения.");
  const ip = request.headers.get("x-puls-client-ip") ?? "";
  if (!isIP(ip)) throw new AppError(403, "ACCESS_FORBIDDEN", "Не удалось проверить источник запроса.");
  return ip;
}
export function enforceOrigin(request: Request, config: ServerConfig) {
  const site = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== config.APP_ORIGIN || site && !["same-origin", "none"].includes(site))
    throw new AppError(403, "CSRF_ORIGIN_INVALID", "Не удалось проверить источник запроса. Обновите страницу.");
}
export async function readBody(request: Request, limit: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
    throw new AppError(413, "PAYLOAD_TOO_LARGE", "Превышен допустимый размер запроса.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},10_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if(timedOut)throw new AppError(400,"BAD_REQUEST","Время передачи запроса истекло. Повторите отправку.");
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new AppError(413, "PAYLOAD_TOO_LARGE", "Превышен допустимый размер запроса."); }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "BAD_REQUEST", "Некорректный запрос.");
  } finally { clearTimeout(timer);reader.releaseLock(); }
}
export function parseStrictJson(raw: string): unknown {
  const errors: ParseError[] = [];
  const tree = parseTree(raw, errors, { disallowComments: true, allowTrailingComma: false });
  const invalid = () => { throw new AppError(400, "BAD_REQUEST", "Некорректный JSON-запрос."); };
  if (!tree || errors.length) return invalid();
  function walk(node: JsonNode,depth=0) {
    if(depth>64)invalid();
    if (node.type === "object") {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const key = String(property.children?.[0].value);
        if (keys.has(key) || ["__proto__", "constructor", "prototype"].includes(key)) invalid();
        keys.add(key);
      }
    }
    node.children?.forEach(child=>walk(child,depth+1));
  }
  walk(tree);
  return JSON.parse(raw);
}
export function jsonContent(request: Request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? ""))
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Неподдерживаемый тип содержимого. Отправьте JSON.");
}
export const sessionCookie = "__Host-puls_session";
export function readToken(request: Request): string | undefined {
  const tokens = (request.headers.get("cookie") ?? "").split(";").map(p => p.trim()).filter(p => p.startsWith(`${sessionCookie}=`));
  if (tokens.length !== 1) return undefined;
  const token = tokens[0].slice(sessionCookie.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}
export function setSessionCookie(response: NextResponse, token: string, expires?: Date) {
  response.cookies.set(sessionCookie, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", ...(expires ? { expires } : { maxAge: 0 }) });
}
export async function errorResponse(error: unknown, requestId = randomUUID()) {
  const safe = safeError(error);
  const { securityAudit } = await import("./security-audit");
  const code = safe.code==="CSRF_ORIGIN_INVALID"?"CSRF_DENIED":safe.status===404||safe.status===403?"ACL_DENIED":safe.code==="SESSION_EXPIRED"?"SESSION_EXPIRED":safe.code.startsWith("EXTERNAL_")?"SOURCE_ERROR":null;
  if(code)await securityAudit(code,{requestId});
  const response = NextResponse.json({ error: { code: safe.code, message: safe.message }, meta: { requestId } },
    { status: safe.status, headers: { ...privateHeaders, ...(safe.retryAfter ? { "Retry-After": String(safe.retryAfter) } : {}) } });
  if (safe.status === 401 && safe.code !== "INVALID_CREDENTIALS") setSessionCookie(response, "");
  return response;
}
