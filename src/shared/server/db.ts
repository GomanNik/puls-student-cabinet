import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readConfig } from "./config";

const globalDb = globalThis as unknown as { pulsDb?: PrismaClient };
export function database(): PrismaClient {
  if (!globalDb.pulsDb) {
    globalDb.pulsDb = new PrismaClient({ adapter: new PrismaPg({
      // Prisma PG нормализует timestamptz как UTC; часовой пояс соединения фиксирован.
      connectionString: readConfig().DATABASE_URL, options: "-c timezone=UTC -c statement_timeout=10000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=20000", max: 8,
      connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000,
    }), log: [] });
  }
  return globalDb.pulsDb;
}
