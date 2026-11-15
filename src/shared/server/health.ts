import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
// OGE health.service: проверка реальной БД без раскрытия её конфигурации.
export async function readiness(db: PrismaClient) {
  try { await db.$queryRaw`SELECT 1`; return true; } catch { return false; }
}
