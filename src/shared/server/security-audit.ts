import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { readConfig } from "./config";
import { Prisma, run } from "./sql";

export const auditCodes = ["AUTH_LOGIN_SUCCESS","AUTH_LOGIN_FAIL","AUTH_LOGIN_RATE_LIMIT","SESSION_REVOKED","SESSION_EXPIRED","ACL_DENIED","CSRF_DENIED","REQUEST_CREATED","APPEAL_CREATED","MESSAGE_CREATED","REMOTE_DELIVERY_UNCERTAIN","REMOTE_STATUS_CONFIRMED","NOTIFICATION_READ","EXPORT_DENIED","EXPORT_CREATED","ASSISTANT_BLOCKED","SOURCE_ERROR"] as const;
type Code = typeof auditCodes[number];
type Target = "SESSION"|"REQUEST"|"APPEAL"|"MESSAGE"|"NOTIFICATION"|"EXPORT"|"ASSISTANT"|"SOURCE"|"ACCESS";
// Нет произвольного metadata/body/URL/target ID. Отдельный best-effort commit:
// ошибка аудита не откатывает пользовательскую операцию и не портит её tx.
export async function securityAudit(code: Code, input: {requestId?: string; accountId?: string; target?: Target} = {}) {
  try {
    const actor = input.accountId ? createHmac("sha256",readConfig().AUTH_RATE_LIMIT_HMAC_KEY).update(`audit:${input.accountId}`).digest() : null;
    const requestId = input.requestId && /^[\w-]{1,80}$/.test(input.requestId) ? input.requestId : randomUUID();
    await run(Prisma.sql`INSERT INTO security_audit_event(event_code,request_id,actor_digest,target_kind) VALUES(${code},${requestId},${actor},${input.target??"ACCESS"})`);
  } catch { console.error("ПУЛЬС: запись журнала безопасности недоступна."); }
}
export async function cleanupSecurityData() {
  // Короткие порции: P-заявки, переписка и история статусов не удаляются.
  await run(Prisma.sql`DELETE FROM security_audit_event WHERE event_id IN (SELECT event_id FROM security_audit_event WHERE occurred_at<now()-interval '30 days' ORDER BY occurred_at LIMIT 1000)`);
  await run(Prisma.sql`DELETE FROM service_concurrency_lease WHERE expires_at<now()`);
  await run(Prisma.sql`DELETE FROM auth_rate_bucket WHERE window_start<now()-interval '1 day' AND (blocked_until IS NULL OR blocked_until<now())`);
}
