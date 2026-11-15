import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { authService } from "@/modules/auth/http-handlers";
import { AppError } from "@/shared/server/errors";
import { sessionCookie } from "@/shared/server/http";
import { StudentShell } from "@/shared/ui/student-shell";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(sessionCookie)?.value;
  try { await authService().requireSession(token, randomUUID()); }
  catch (error) {
    if (error instanceof AppError && error.status === 401) redirect(error.code === "SESSION_EXPIRED" ? "/login?reason=expired" : "/login");
    throw new Error("Сервис временно недоступен.");
  }
  return <StudentShell>{children}</StudentShell>;
}
