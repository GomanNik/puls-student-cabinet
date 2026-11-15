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
export function pageSlice<T>(items: readonly T[], accountId: string, filters: unknown, revision: string, limit: number, cursor?: string) {
  const filter = mac("filters", JSON.stringify(filters));
  const actor = mac("actor", accountId);
  const version = mac("revision", revision);
  let offset = 0;
  if (cursor) {
    try {
      if (cursor.length > 2048) throw new Error();
      const [payload, signature, extra] = cursor.split(".");
      const expected = mac("cursor", payload);
      if (extra !== undefined || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
      const decoded = cursorSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
      if (decoded.actor !== actor || decoded.filter !== filter || decoded.expires <= Date.now()) throw new Error();
      if (decoded.revision !== version) throw new AppError(409, "SOURCE_REVISION_CHANGED", "Данные изменились. Обновите список.");
      if (decoded.offset > items.length) throw new Error();
      offset = decoded.offset;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(422, "VALIDATION_ERROR", "Не удалось продолжить список. Обновите страницу.");
    }
  }
  const next = offset + limit;
  let nextCursor: string | null = null;
  if (next < items.length) {
    const payload = Buffer.from(JSON.stringify({ actor, filter, revision: version, offset: next, expires: Date.now() + 15 * 60_000 })).toString("base64url");
    nextCursor = `${payload}.${mac("cursor", payload)}`;
  }
  return { items: items.slice(offset, next), nextCursor };
}
