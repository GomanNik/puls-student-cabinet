import "server-only";
import type { AuthContext } from "@/modules/auth/context";
import { assertAuthContext } from "@/modules/auth/context";
import { AppError } from "./errors";
import { Prisma, rows, type SqlClient } from "./sql";

/**
 * Проверка и блокировка самой сессии до завершения P-транзакции.
 * Logout обновляет auth_session, поэтому UPDATE logout конфликтует
 * с удерживаемым FOR SHARE. Блокировки освобождаются только после commit.
 */
export async function lockAndRevalidateSession(tx: SqlClient, context: AuthContext): Promise<void> {
  assertAuthContext(context);
  // Общий порядок блокировок для всех записей одного аккаунта. Он также
  // сериализует проверку ключа идемпотентности и лимита перед INSERT.
  await rows(Prisma.sql`SELECT account_id FROM student_account WHERE account_id=${context.accountId}::uuid FOR UPDATE`, tx);
  const matched = await rows<{ session_id: string }>(Prisma.sql`
    SELECT s.session_id
    FROM auth_session s
    JOIN student_account a ON a.account_id = s.account_id
    JOIN account_credential c ON c.account_id = a.account_id
      AND c.credential_type_code = 'LOGIN_PASSWORD'
      AND c.credential_state_code = 'ACTIVE'
    WHERE s.session_id = ${context.sessionId}::uuid
      AND s.account_id = ${context.accountId}::uuid
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND s.last_activity_at > now() - interval '12 hours'
      AND a.account_state_code = 'ACTIVE'
    FOR SHARE OF s, a, c
  `, tx);
  if (matched.length !== 1) {
    throw new AppError(401, "SESSION_EXPIRED", "Сессия завершилась. Войдите снова.");
  }
}
