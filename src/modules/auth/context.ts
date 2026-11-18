import "server-only";
import { createHmac } from "node:crypto";
import { readConfig } from "@/shared/server/config";

const known = new WeakSet<object>();
export type AuthContext = Readonly<{ accountId: string; sessionId: string; requestId: string }>;
// Только модуль сессии создаёт контекст; plain object из HTTP не даёт полномочий.
export function createAuthContext(accountId: string, sessionId: string, requestId: string): AuthContext {
  const context = Object.freeze({ accountId, sessionId, requestId }); known.add(context); return context;
}
export function assertAuthContext(context: AuthContext) {
  if (!known.has(context)) throw new Error("Контекст авторизации не был подтверждён сервером.");
}

// Метка для изоляции клиентского кэша. Не содержит токена и не даёт полномочий.
export function clientSessionScope(context: AuthContext) {
  assertAuthContext(context);
  return createHmac("sha256", readConfig().AUTH_RATE_LIMIT_HMAC_KEY)
    .update(JSON.stringify(["puls-client-cache-v1", context.accountId, context.sessionId]))
    .digest("base64url");
}
