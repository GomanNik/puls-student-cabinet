import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { retryTransaction } from "@/shared/server/transaction";
import { AppError, safeError } from "@/shared/server/errors";
import { parseStrictJson, enforceOrigin, readBody, enforceTransport } from "@/shared/server/http";
import { readConfig } from "@/shared/server/config";
import { loginSchema } from "@/shared/contracts/auth";
import { RequestGeneration } from "@/shared/api/request-generation";
import { safeClientMessage } from "@/shared/api/client";
import { passwordOptions } from "@/modules/auth/password";
import { randomBytes } from "node:crypto";

const config = readConfig({ DATABASE_URL: "postgresql://localhost/puls_test", APP_ORIGIN: "https://localhost:3444", AUTH_RATE_LIMIT_HMAC_KEY: randomBytes(32).toString("base64url"), TRUSTED_PROXY_KEY: randomBytes(32).toString("base64url") });
describe("строгая граница HTTP", () => {
  it.each(['{"login":"a","login":"b"}', '{"login":"a","l\\u006fgin":"b"}', '{"__proto__":{}}', '{"constructor":{}}', '{"login":', '{"login":"a",}', '/* comment */ {}'])("отвергает неоднозначный JSON %s", raw => expect(() => parseStrictJson(raw)).toThrow(AppError));
  it("не нормализует пароль и запрещает подмену владельца", () => {
    const value = loginSchema.parse({ login: " DEMO-A ", password: " x " });
    expect(value).toEqual({ login: "demo-a", password: " x " });
    expect(loginSchema.safeParse({ login: "demo-a", password: "x", accountId: "foreign" }).success).toBe(false);
    expect(loginSchema.safeParse({ login: "a\n", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ login: "x".repeat(121), password: "x" }).success).toBe(false);
  });
  it.each([undefined, "null", "http://localhost:3444", "https://localhost:3444.attacker.test", "https://localhost:3444/"])("отклоняет Origin %s", origin => {
    const request = new Request(config.APP_ORIGIN, { headers: origin ? { Origin: origin } : {} });
    expect(() => enforceOrigin(request, config)).toThrow(AppError);
  });
  it("не доверяет same-site и поддельному прокси", () => {
    expect(() => enforceOrigin(new Request(config.APP_ORIGIN, { headers: { Origin: config.APP_ORIGIN, "Sec-Fetch-Site": "same-site" } }), config)).toThrow(AppError);
    expect(() => enforceTransport(new Request(config.APP_ORIGIN, { headers: { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "https" } }), config)).toThrow(AppError);
  });
  it("ограничивает фактическое тело без доверия Content-Length", async () => {
    await expect(readBody(new Request(config.APP_ORIGIN, { method: "POST", body: "x".repeat(4097) }), 4096)).rejects.toMatchObject({ status: 413 });
  });
  it("скрывает технические ошибки сервера и клиента", () => {
    expect(safeError(new Error("private sql token" )).message.includes("private")).toBe(false);
    expect(safeClientMessage(new Error("private network secret")).includes("private")).toBe(false);
  });
  it("проверяет конфигурацию без включения значений в ошибку", () => {
    expect(() => readConfig({ ...config, APP_ORIGIN: "http://localhost" })).toThrow("Некорректная серверная конфигурация");
    expect(passwordOptions).toMatchObject({ memoryCost: 65536, timeCost: 3, parallelism: 1 });
  });
});
describe("механизмы OGE после адаптации", () => {
  it.each(["40001", "40P01"])("повторяет целиком транзакцию %s", async code => {
    const error = new Prisma.PrismaClientKnownRequestError("private", { code: "P2010", clientVersion: Prisma.prismaVersion.client, meta: { code } });
    const run = vi.fn().mockRejectedValueOnce(error).mockResolvedValue("ok");
    await expect(retryTransaction(run)).resolves.toBe("ok"); expect(run).toHaveBeenCalledTimes(2);
  });
  it("ограничивает число повторов", async () => {
    const run = vi.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("private", { code: "P2034", clientVersion: Prisma.prismaVersion.client }));
    await expect(retryTransaction(run)).rejects.toMatchObject({ status: 503 }); expect(run).toHaveBeenCalledTimes(3);
  });
  it("не повторяет ошибку прав", async () => {
    const run = vi.fn().mockRejectedValue(new AppError(403, "ACCESS_FORBIDDEN", "Отказ"));
    await expect(retryTransaction(run)).rejects.toMatchObject({ status: 403 }); expect(run).toHaveBeenCalledTimes(1);
  });
  it("отменяет прежний запрос и не принимает поздний ответ аккаунта A", () => {
    const generation = new RequestGeneration(); const a = generation.next(); generation.invalidate(); const b = generation.next();
    expect(a.signal.aborted).toBe(true); expect(a.isCurrent()).toBe(false); expect(b.isCurrent()).toBe(true);
  });
});
