import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authService } from "@/modules/auth/http-handlers";
import type { AuthContext } from "@/modules/auth/context";
import { readConfig } from "./config";
import { AppError } from "./errors";
import { enforceTransport, errorResponse, privateHeaders, readToken } from "./http";

export function readRoute<T>(schema: z.ZodType<T>, read: (auth: AuthContext, request: Request) => Promise<T>) {
  return async (request: Request) => {
    const requestId = randomUUID();
    try {
      enforceTransport(request, readConfig());
      const auth = await authService().requireSession(readToken(request), requestId);
      const result = schema.parse(await read(auth, request));
      await authService().requireSession(readToken(request), requestId);
      return NextResponse.json(result, { headers: privateHeaders });
    } catch (error) { return errorResponse(error, requestId); }
  };
}
export function query<T>(request: Request, schema: z.ZodType<T>): T {
  const pairs = [...new URL(request.url).searchParams];
  if (new Set(pairs.map(([key]) => key)).size !== pairs.length) throw new AppError(422, "VALIDATION_ERROR", "Параметры запроса не должны повторяться.");
  const parsed = schema.safeParse(Object.fromEntries(pairs));
  if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", "Проверьте параметры запроса.");
  return parsed.data;
}
export const pagingQuery = { limit: z.coerce.number().int().min(1).max(100).default(20), cursor: z.string().min(1).max(2048).optional() };
export const emptyQuery = z.strictObject({});
export const notFound = () => new AppError(404, "NOT_FOUND", "Запись не найдена.");
