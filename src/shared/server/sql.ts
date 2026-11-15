import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { database } from "./db";
export { Prisma };
export type SqlClient = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export const rows = <T>(query: Prisma.Sql, client: SqlClient = database()) => client.$queryRaw<T[]>(query);
export const run = (query: Prisma.Sql, client: SqlClient = database()) => client.$executeRaw(query);
