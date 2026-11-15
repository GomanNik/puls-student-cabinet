import "server-only";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { unavailable } from "./errors";

// Механизм OGE Tutor common/transaction-conflict.ts; повторяется вся транзакция.
export function isRetryableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)));
}
export async function retryTransaction<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      if (!isRetryableTransactionConflict(error)) throw error;
      if (attempt === 2) throw unavailable();
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
export const transaction = <T>(db: PrismaClient, action: (tx: Prisma.TransactionClient) => Promise<T>) =>
  retryTransaction(() => db.$transaction(action, { timeout: 15000, maxWait: 5000 }));
