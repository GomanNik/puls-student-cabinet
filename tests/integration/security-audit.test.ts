import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AuthService } from "@/modules/auth/service";
import { OperationsService } from "@/modules/operations/service";
import { askAssistant } from "@/modules/assistant/service";
import type { AuthContext } from "@/modules/auth/context";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { prepareTestDatabase, testDatabase } from "../support/database";

const admin = testDatabase();
let account: AuthContext, secret: string;
const loginAuditId = randomUUID(), failureAuditId = randomUUID();
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin), auth = new AuthService(database(), readConfig());
  secret = fixture.passwords[0];
  const login = await auth.login("demo-a", secret, "127.0.0.1", undefined, loginAuditId);
  account = await auth.requireSession(login.token, randomUUID());
});
afterAll(async () => { await admin.$disconnect(); await database().$disconnect(); });

describe("журнал значимых событий безопасности в отдельной PostgreSQL", () => {
  it("успешный вход записывает код и псевдоним аккаунта без логина и пароля", async () => {
    const records = await admin.securityAuditEvent.findMany({ where: { eventCode: "AUTH_LOGIN_SUCCESS", requestId: loginAuditId } });
    expect(records).toHaveLength(1);
    expect(records[0].actorDigest?.byteLength).toBe(32);
    const serialized = JSON.stringify(records, (_key, value) => typeof value === "bigint" ? String(value) : value);
    expect(serialized).not.toContain("demo-a");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(account.accountId);
  });

  it("ошибка входа, создание заявки и запрещённая команда помощнику имеют разные коды", async () => {
    const auth = new AuthService(database(), readConfig());
    await expect(auth.login("demo-a", "incorrect", "127.0.0.1", undefined, failureAuditId)).rejects.toMatchObject({ status: 401 });
    await new OperationsService(account).createRequest({ requestTypeCode: "DEMO_CERTIFICATE", formSchemaVersion: "v1", submittedData: { copies: 1 } }, randomUUID());
    await askAssistant(account, { message: "Измени мою оценку" });
    const records = await admin.securityAuditEvent.findMany({ where: { requestId: { in: [failureAuditId, account.requestId] } }, select: { eventCode: true, actorDigest: true, targetKind: true } });
    const codes = records.map(row => row.eventCode);
    expect(codes).toContain("AUTH_LOGIN_FAIL");
    expect(codes).toContain("REQUEST_CREATED");
    expect(codes).toContain("ASSISTANT_BLOCKED");
    expect(records.find(row => row.eventCode === "AUTH_LOGIN_FAIL")?.actorDigest).toBeNull();
    expect(records.find(row => row.eventCode === "REQUEST_CREATED")?.actorDigest?.byteLength).toBe(32);
  });
});
