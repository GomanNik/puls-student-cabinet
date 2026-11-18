import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { authService } from "@/modules/auth/http-handlers";
import { safeError } from "@/shared/server/errors";
import { sessionCookie } from "@/shared/server/http";
import { StudentShell } from "@/shared/ui/student-shell";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(sessionCookie)?.value;
  const requestId = randomUUID();
  try { await authService().requireSession(token, requestId); }
  catch (error) {
    const safe = safeError(error);
    if (safe.status === 401) redirect(safe.code === "SESSION_EXPIRED" ? "/login?reason=expired" : "/login");
    // Только код и категория: URL БД, cookie и текст исключения в журнал не попадают.
    console.error(`ПУЛЬС: проверка сессии недоступна; requestId=${requestId}; status=${safe.status}; code=${safe.code}.`);
    throw safe;
  }
  return <StudentShell>{children}</StudentShell>;
}
