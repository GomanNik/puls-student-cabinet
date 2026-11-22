import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { readConfig } from "./config";
import { AppError } from "./errors";

function mac(namespace: string, value: string) {
  return createHmac("sha256", readConfig().AUTH_RATE_LIMIT_HMAC_KEY).update(`puls:${namespace}\0${value}`).digest("base64url");
}
export function opaqueRef(accountId: string, source: string, kind: string, ...ids: string[]) {
  return mac("object", JSON.stringify([accountId, source, kind, ...ids]));
}
const cursorSchema = z.strictObject({ actor: z.string(), filter: z.string(), revision: z.string(), offset: z.number().int().min(0), expires: z.number() });
function cursorScope(accountId: string, filters: unknown, revision: string) {
  return { filter: mac("filters", JSON.stringify(filters)), actor: mac("actor", accountId), version: mac("revision", revision) };
}
function cursorOffset(cursor: string | undefined, scope: ReturnType<typeof cursorScope>, itemCount: number) {
  if (!cursor) return 0;
  try {
    if (cursor.length > 2048) throw new Error();
    const [payload, signature, extra] = cursor.split(".");
    const expected = mac("cursor", payload);
    if (extra !== undefined || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
    const decoded = cursorSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (decoded.actor !== scope.actor || decoded.filter !== scope.filter || decoded.expires <= Date.now()) throw new Error();
    if (decoded.revision !== scope.version) throw new AppError(409, "SOURCE_REVISION_CHANGED", "Данные изменились. Обновите список.");
    if (decoded.offset > itemCount) throw new Error();
    return decoded.offset;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(422, "VALIDATION_ERROR", "Не удалось продолжить список. Обновите страницу.");
  }
}
function makeCursor(offset: number, scope: ReturnType<typeof cursorScope>) {
  const payload = Buffer.from(JSON.stringify({ actor: scope.actor, filter: scope.filter, revision: scope.version, offset, expires: Date.now() + 15 * 60_000 })).toString("base64url");
  return `${payload}.${mac("cursor", payload)}`;
}
export function pageSlice<T>(items: readonly T[], accountId: string, filters: unknown, revision: string, limit: number, cursor?: string) {
  const scope = cursorScope(accountId, filters, revision);
  const offset = cursorOffset(cursor, scope, items.length);
  const next = offset + limit;
  return { items: items.slice(offset, next), nextCursor: next < items.length ? makeCursor(next, scope) : null };
}
export function pageSliceWithNavigation<T>(items: readonly T[], accountId: string, filters: unknown, revision: string, limit: number, cursor?: string) {
  const scope = cursorScope(accountId, filters, revision);
  const offset = cursorOffset(cursor, scope, items.length);
  const totalPages = Math.max(1, Math.ceil(items.length / limit));
  const page = pageSlice(items, accountId, filters, revision, limit, cursor);
  return {
    ...page,
    totalItems: items.length,
    totalPages,
    pageNumber: Math.floor(offset / limit) + 1,
    previousCursor: offset > 0 ? makeCursor(Math.max(0, offset - limit), scope) : null,
  };
}
