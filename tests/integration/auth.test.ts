import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { AuthService, ABSOLUTE_MS, IDLE_MS, digestToken } from "@/modules/auth/service";
import { authHandler } from "@/modules/auth/http-handlers";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { readiness } from "@/shared/server/health";
import { seedStudents } from "../../prisma/seed-service";
import { demoStudents } from "../../prisma/seed-data";
import { prepareTestDatabase, testDatabase } from "../support/database";
import { unavailableAcademicScope } from "@/modules/student-context/scope";
import { contractAccepts } from "../support/contract";

const admin = testDatabase();
let fixture: Awaited<ReturnType<typeof prepareTestDatabase>>;
const config = readConfig();
let now: Date;
let service: AuthService;
const requestId = () => randomUUID();
beforeAll(async () => { fixture = await prepareTestDatabase(admin); });
beforeEach(async () => { now = new Date(); service = new AuthService(database(), config, () => now); await admin.authRateBucket.deleteMany(); });
afterAll(async () => { await admin.$disconnect(); await database().$disconnect(); });

describe("сессии в настоящем PostgreSQL", () => {
  it.each([0, 1])("входит аккаунт %i и возвращает только собственный профиль", async index => {
    const session = await service.login(demoStudents[index].login, fixture.passwords[index], "127.0.0.1");
    const context = await service.requireSession(session.token, requestId());
    const profile = await service.profile(context);
    expect(profile.fullName).toBe(demoStudents[index].fullName);
    expect(profile.group).toBe(demoStudents[index].group);
    expect(Object.keys(profile).sort()).toEqual(["course", "faculty", "fullName", "group", "studyProgram"]);
    const row = await admin.authSession.findUniqueOrThrow({ where: { tokenDigest: digestToken(session.token) } });
    expect(row.tokenDigest.byteLength).toBe(32);
    expect(Buffer.from(row.tokenDigest).toString().includes(session.token)).toBe(false);
    expect(row.expiresAt.getTime() - row.issuedAt.getTime()).toBe(ABSOLUTE_MS);
    // Независимый SQL epoch выявляет смещение, скрытое симметричным ORM round-trip.
    const [stored] = await admin.$queryRaw<{ epoch: number }[]>`SELECT (extract(epoch FROM issued_at)*1000)::double precision AS epoch FROM auth_session WHERE token_digest=${digestToken(session.token)}`;
    expect(stored.epoch).toBe(now.getTime());
  });
  it("одинаково отказывает при неизвестном логине и неверном пароле", async () => {
    for (const login of [demoStudents[0].login, "missing-demo-account"]) {
      await expect(service.login(login, randomBytes(20).toString("hex"), "127.0.0.1")).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS", message: "Неверный логин или пароль" });
    }
  });
  it("отказывает без cookie и при подделке", async () => {
    await expect(service.requireSession(undefined, requestId())).rejects.toMatchObject({ status: 401 });
    await expect(service.requireSession(randomBytes(32).toString("base64url"), requestId())).rejects.toMatchObject({ status: 401 });
  });
  it("logout отзывает текущую сессию, повтор безопасен, другой браузер остаётся", async () => {
    const first = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    const second = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    await service.logout(first.token); await service.logout(first.token);
    await expect(service.requireSession(first.token, requestId())).rejects.toMatchObject({ status: 401 });
    await expect(service.requireSession(second.token, requestId())).resolves.toHaveProperty("accountId");
  });
  it("новый вход в браузере отзывает старую cookie и меняет токен", async () => {
    const a = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    await expect(service.login("demo-b", randomBytes(20).toString("hex"), "127.0.0.1", a.token)).rejects.toMatchObject({ status: 401 });
    await expect(service.requireSession(a.token, requestId())).resolves.toHaveProperty("accountId");
    const b = await service.login("demo-b", fixture.passwords[1], "127.0.0.1", a.token);
    expect(a.token === b.token).toBe(false);
    await expect(service.requireSession(a.token, requestId())).rejects.toMatchObject({ status: 401 });
    const context = await service.requireSession(b.token, requestId());
    expect((await service.profile(context)).fullName).toBe(demoStudents[1].fullName);
  });
  it.each(["idle", "absolute"])("истекает %s сессия на точной границе", async mode => {
    const login = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    if (mode === "absolute") await admin.authSession.update({ where: { tokenDigest: digestToken(login.token) }, data: { lastActivityAt: new Date(now.getTime() + ABSOLUTE_MS - 1000) } });
    now = new Date(now.getTime() + (mode === "idle" ? IDLE_MS : ABSOLUTE_MS));
    await expect(service.requireSession(login.token, requestId())).rejects.toMatchObject({ status: 401 });
  });
  it("активность обновляется, абсолютный предел не сдвигается", async () => {
    const login = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    now = new Date(now.getTime() + 6 * 60 * 1000);
    const context = await service.requireSession(login.token, requestId());
    const dto = await service.session(context);
    expect(dto.absoluteExpiresAt).toBe(login.data.absoluteExpiresAt);
    expect(Date.parse(dto.expiresAt)).toBe(now.getTime() + IDLE_MS);
  });
  it("отключённый аккаунт немедленно теряет доступ", async () => {
    const login = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    await admin.studentAccount.update({ where: { accountId: fixture.ids[0] }, data: { accountStateCode: "DISABLED" } });
    try { await expect(service.requireSession(login.token, requestId())).rejects.toMatchObject({ status: 401 }); }
    finally { await admin.studentAccount.update({ where: { accountId: fixture.ids[0] }, data: { accountStateCode: "ACTIVE" } }); }
  });
  it("блокирует login bucket после пяти ошибок и не хранит сырой логин/IP", async () => {
    for (let i = 0; i < 5; i++) await expect(service.login("demo-a", "wrong", "127.0.0.1")).rejects.toMatchObject({ status: 401 });
    await expect(service.login("demo-a", fixture.passwords[0], "127.0.0.1")).rejects.toMatchObject({ status: 429, retryAfter: 900 });
    const buckets = await admin.authRateBucket.findMany();
    expect(buckets.every(row => row.keyDigest.byteLength === 32 && row.failedCount === 5)).toBe(true);
    now = new Date(now.getTime() + 15 * 60 * 1000);
    await expect(service.login("demo-a", fixture.passwords[0], "127.0.0.1")).resolves.toHaveProperty("data");
  });
  it("конкурентные ошибки не теряются при row lock", async () => {
    const results = await Promise.allSettled([service.login("demo-a", "wrong", "127.0.0.1"), service.login("demo-a", "wrong", "127.0.0.1")]);
    expect(results.every(r => r.status === "rejected")).toBe(true);
    expect((await admin.authRateBucket.findMany()).every(row => row.failedCount === 2)).toBe(true);
  });
  it("профиль не даёт академических полномочий без R-источника", async () => {
    const login = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    const context = await service.requireSession(login.token, requestId());
    await expect(unavailableAcademicScope.resolve(context, "period-a")).rejects.toMatchObject({ status: 503 });
  });
  it("повторный seed не сбрасывает пароль", async () => {
    const before = await admin.accountCredential.findUniqueOrThrow({ where: { loginIdentifierNormalized: "demo-a" } });
    await seedStudents(admin, [randomBytes(24).toString("hex"), randomBytes(24).toString("hex")]);
    const after = await admin.accountCredential.findUniqueOrThrow({ where: { loginIdentifierNormalized: "demo-a" } });
    expect(before.passwordHash === after.passwordHash).toBe(true);
  });
  it("runtime роль не имеет DDL, БД хранит CHECK инварианты", async () => {
    await expect(database().$executeRaw`CREATE TABLE must_not_create(id int)`).rejects.toBeDefined();
    await expect(admin.studentProfile.update({ where: { accountId: fixture.ids[0] }, data: { courseNumber: 0 } })).rejects.toBeDefined();
    expect(await readiness(database())).toBe(true);
  });
});

describe("реальные обработчики Student API", () => {
  function request(path: string, options: RequestInit = {}) {
    return new Request(`${config.APP_ORIGIN}/api/v1${path}`, { ...options, headers: {
      "x-puls-proxy-key": config.TRUSTED_PROXY_KEY, "x-puls-client-ip": "127.0.0.1", "x-forwarded-proto": "https", ...options.headers,
    } });
  }
  it("Origin проверяется до входа и изменения сессии", async () => {
    for (const operation of ["login", "logout"] as const) {
      const response = await authHandler(operation)(request(`/auth/${operation}`, { method: "POST", headers: { Origin: "https://attacker.invalid" } }));
      expect(response.status).toBe(403); expect((await response.json()).error.code).toBe("CSRF_ORIGIN_INVALID");
    }
  });
  it("строгий DTO отвергает подмену accountId", async () => {
    const response = await authHandler("login")(request("/auth/login", { method: "POST", headers: { Origin: config.APP_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ login: "demo-a", password: fixture.passwords[0], accountId: fixture.ids[1] }) }));
    expect(response.status).toBe(422);
  });
  it("чужой query/header не меняет владельца профиля; наружу выходит безопасный DTO", async () => {
    const login = await service.login("demo-a", fixture.passwords[0], "127.0.0.1");
    const response = await authHandler("profile")(request(`/profile?studentId=${fixture.ids[1]}&accountId=${fixture.ids[1]}`, { headers: { Cookie: `__Host-puls_session=${login.token}`, "x-account-id": fixture.ids[1] } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json(); expect(body.data.fullName).toBe(demoStudents[0].fullName);
    expect(contractAccepts("ProfileResponse", body)).toBe(true);
    const serialized = JSON.stringify(body);
    expect([login.token, fixture.passwords[0], fixture.ids[0], fixture.ids[1], "tokenDigest", "passwordHash"].some(secret => serialized.includes(secret))).toBe(false);
  });
  it("ответы login/me соответствуют действующему OpenAPI 3.1", async () => {
    const response = await authHandler("login")(request("/auth/login", { method: "POST", headers: { Origin: config.APP_ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ login: "demo-b", password: fixture.passwords[1] }) }));
    expect(response.status).toBe(200);
    expect(contractAccepts("SessionResponse", await response.json())).toBe(true);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const me = await authHandler("me")(request("/auth/me", { headers: { Cookie: cookie } }));
    expect(me.status).toBe(200); expect(contractAccepts("SessionResponse", await me.json())).toBe(true);
  });
});
