import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AuthContext } from "@/modules/auth/context";
import { AuthService } from "@/modules/auth/service";
import { OperationsService } from "@/modules/operations/service";
import { administrationTick } from "@/modules/operations/worker";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { prepareTestDatabase, testDatabase } from "../support/database";

const admin = testDatabase();
let account: AuthContext;
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin), auth = new AuthService(database(), readConfig());
  const login = await auth.login("demo-a", fixture.passwords[0], "127.0.0.1");
  account = await auth.requireSession(login.token, randomUUID());
});
afterAll(async () => { delete process.env.PULS_ADMIN_FIXTURE_SCENARIO; await admin.$disconnect(); await database().$disconnect(); });
async function mode(value: string, action: () => Promise<void>) {
  const previous = process.env.PULS_ADMIN_FIXTURE_SCENARIO;
  process.env.PULS_ADMIN_FIXTURE_SCENARIO = value;
  try { await action(); }
  finally { if (previous === undefined) delete process.env.PULS_ADMIN_FIXTURE_SCENARIO; else process.env.PULS_ADMIN_FIXTURE_SCENARIO = previous; }
}
const createRequest = () => new OperationsService(account).createRequest({ requestTypeCode: "DEMO_CERTIFICATE", formSchemaVersion: "v1", submittedData: { copies: 1 } }, randomUUID());
const due = new Date(0);

describe("восстановление доставки без потери локальной операции", () => {
  it("недоступный источник сохраняет заявку локально и повтор использует ту же операцию", async () => {
    const service = new OperationsService(account), created = await createRequest();
    await mode("unavailable", async () => { await administrationTick(); });
    const failed = await service.request(created.id);
    expect(failed.localState).toBe("STORED");
    expect(failed.externalState).toBe("RETRYABLE_ERROR");
    expect(failed.businessStatus).toBeNull();
    const original = await admin.requestExternalOperation.findFirstOrThrow({ where: { requestId: created.id }, include: { attempts: true } });
    expect(original.attempts).toHaveLength(1);
    expect(original.attempts[0].outcomeCode).toBe("RETRYABLE_ERROR");
    await admin.requestExternalOperation.update({ where: { operationId: original.operationId }, data: { nextAttemptAt: due } });
    await administrationTick();
    const delivered = await service.request(created.id);
    expect(delivered.externalState).toBe("ACKNOWLEDGED");
    expect(delivered.businessStatus).toBe("SUBMITTED");
    expect((await admin.requestExternalOperation.findUniqueOrThrow({ where: { operationId: original.operationId }, include: { attempts: true } })).attempts).toHaveLength(2);
    expect((await admin.studentRequest.findMany({ where: { requestId: created.id } }))).toHaveLength(1);
  });

  it("неопределённый исход таймаута не объявляется отправкой до подтверждения", async () => {
    const service = new OperationsService(account), created = await createRequest();
    await mode("timeout-after-accept", async () => { await administrationTick(); });
    const pending = await service.request(created.id);
    expect(pending.externalState).toBe("UNKNOWN");
    expect(pending.businessStatus).toBeNull();
    const operation = await admin.requestExternalOperation.findFirstOrThrow({ where: { requestId: created.id } });
    await admin.requestExternalOperation.update({ where: { operationId: operation.operationId }, data: { nextAttemptAt: due } });
    await administrationTick();
    expect((await service.request(created.id)).businessStatus).toBe("SUBMITTED");
    expect((await admin.requestExternalOperation.findMany({ where: { requestId: created.id } }))).toHaveLength(1);
  });

  it("активная lease препятствует второму обработчику захватить операцию", async () => {
    const created = await createRequest();
    const operation = await admin.requestExternalOperation.findFirstOrThrow({ where: { requestId: created.id } });
    await admin.requestExternalOperation.update({ where: { operationId: operation.operationId }, data: { leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 60_000) } });
    await administrationTick();
    expect((await new OperationsService(account).request(created.id)).businessStatus).toBeNull();
    expect(await admin.requestExternalAttempt.count({ where: { operationId: operation.operationId } })).toBe(0);
    await admin.requestExternalOperation.update({ where: { operationId: operation.operationId }, data: { leaseUntil: due } });
    await administrationTick();
    expect((await new OperationsService(account).request(created.id)).businessStatus).toBe("SUBMITTED");
  });

  it("сообщения не обгоняют предыдущую ошибочную передачу", async () => {
    const service = new OperationsService(account);
    const appeal = await service.createAppeal({ categoryCode: "QUESTION", subject: "Порядок сообщений", firstMessage: "Здравствуйте! Проверьте последовательность доставки." }, randomUUID());
    await administrationTick();
    const first = await service.sendMessage(appeal.id, { body: "Первое дополнительное сообщение." }, randomUUID());
    const second = await service.sendMessage(appeal.id, { body: "Второе дополнительное сообщение." }, randomUUID());
    await mode("unavailable", async () => { await administrationTick(); });
    expect((await admin.messageDeliveryOperation.findFirstOrThrow({ where: { messageId: first.id } })).deliveryStateCode).toBe("RETRYABLE_ERROR");
    expect((await admin.messageDeliveryOperation.findFirstOrThrow({ where: { messageId: second.id } })).deliveryStateCode).toBe("PENDING");
    await admin.messageDeliveryOperation.updateMany({ where: { messageId: first.id }, data: { nextAttemptAt: due } });
    await administrationTick();
    const messages = await service.messages(appeal.id);
    expect(messages.find(item => item.messageId === first.id)?.deliveryState).toBe("ACKNOWLEDGED");
    expect(messages.find(item => item.messageId === second.id)?.deliveryState).toBe("ACKNOWLEDGED");
    expect(messages.find(item => item.messageId === first.id)!.sequenceNumber).toBeLessThan(messages.find(item => item.messageId === second.id)!.sequenceNumber);
  });

  it("дублированный ответ источника сохраняется в переписке ровно один раз", async () => {
    const service = new OperationsService(account);
    const appeal = await service.createAppeal({ categoryCode: "QUESTION", subject: "Повтор ответа", firstMessage: "Здравствуйте! Это проверка повтора ответа." }, randomUUID());
    await administrationTick();
    const operation = await admin.appealExternalOperation.findFirstOrThrow({ where: { appealId: appeal.id } });
    await admin.appealExternalOperation.update({ where: { operationId: operation.operationId }, data: { startedAt: new Date(Date.now() - 31_000), nextPollAt: due } });
    await mode("duplicate-reply", async () => { await administrationTick(); });
    const replies = (await service.messages(appeal.id)).filter(item => item.senderKind === "EXTERNAL_PARTY");
    expect(replies).toHaveLength(1);
    await admin.appealExternalOperation.update({ where: { operationId: operation.operationId }, data: { nextPollAt: due } });
    await mode("duplicate-reply", async () => { await administrationTick(); });
    expect((await service.messages(appeal.id)).filter(item => item.senderKind === "EXTERNAL_PARTY")).toHaveLength(1);
  });
});
