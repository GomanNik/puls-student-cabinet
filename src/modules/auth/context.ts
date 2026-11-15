import "server-only";

const known = new WeakSet<object>();
export type AuthContext = Readonly<{ accountId: string; sessionId: string; requestId: string }>;
// Только модуль сессии создаёт контекст; plain object из HTTP не даёт полномочий.
export function createAuthContext(accountId: string, sessionId: string, requestId: string): AuthContext {
  const context = Object.freeze({ accountId, sessionId, requestId }); known.add(context); return context;
}
export function assertAuthContext(context: AuthContext) {
  if (!known.has(context)) throw new Error("Контекст авторизации не был подтверждён сервером.");
}
