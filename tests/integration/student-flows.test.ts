import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { AuthContext } from "@/modules/auth/context";
import { AuthService } from "@/modules/auth/service";
import { CommunityService, categories } from "@/modules/community/service";
import { OperationsService } from "@/modules/operations/service";
import { askAssistant } from "@/modules/assistant/service";
import { administrationTick } from "@/modules/operations/worker";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { seedOperations } from "../../prisma/seed-operations";
import { prepareTestDatabase, testDatabase } from "../support/database";

const admin = testDatabase();
let a: AuthContext, b: AuthContext;
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin);
  const previous = process.env.PULS_SEED_DEMO_OPERATIONS;
  process.env.PULS_SEED_DEMO_OPERATIONS = "1";
  try { await seedOperations(admin, fixture.ids); }
  finally { if (previous === undefined) delete process.env.PULS_SEED_DEMO_OPERATIONS; else process.env.PULS_SEED_DEMO_OPERATIONS = previous; }
  const auth = new AuthService(database(), readConfig());
  const sessions = await Promise.all([
    auth.login("demo-a", fixture.passwords[0], "127.0.0.1"),
    auth.login("demo-b", fixture.passwords[1], "127.0.0.1"),
  ]);
  [a, b] = await Promise.all(sessions.map(session => auth.requireSession(session.token, randomUUID())));
});
afterAll(async () => { await admin.$disconnect(); await database().$disconnect(); });

describe("собственные действия и два аккаунта", () => {
  it("повтор заявления сохраняет одну запись; другой payload конфликтует; ключи изолированы", async () => {
    const input = { requestTypeCode: "DEMO_CERTIFICATE", formSchemaVersion: "v1", submittedData: { copies: 1 } } as const;
    const key = randomUUID(), serviceA = new OperationsService(a), serviceB = new OperationsService(b);
    const first = await serviceA.createRequest(input, key);
    const retry = await serviceA.createRequest(input, key);
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.id).toBe(first.id);
    expect(first.data.externalState).toBe("PENDING");
    expect(first.data.businessStatus).toBeNull();
    await expect(serviceA.createRequest({ ...input, submittedData: { copies: 2 } }, key)).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    expect(await serviceA.resolve({ operationScope: "CREATE_REQUEST", idempotencyKey: key })).toMatchObject({ state: "COMMITTED", target: { targetRef: first.id } });
    expect(await serviceB.resolve({ operationScope: "CREATE_REQUEST", idempotencyKey: key })).toMatchObject({ state: "NOT_FOUND" });
    const ownB = await serviceB.createRequest(input, key);
    expect(ownB.id).not.toBe(first.id);
    await expect(serviceB.request(first.id)).rejects.toMatchObject({ status: 404 });
    expect((await admin.studentRequest.findMany({ where: { requestId: first.id } })).length).toBe(1);
  });

  it("обращение и сообщение сохраняются один раз и доступны только владельцу", async () => {
    const serviceA = new OperationsService(a), serviceB = new OperationsService(b);
    const input = { categoryCode: "QUESTION", subject: "Проверка переписки", firstMessage: "Здравствуйте! Нужна информация по учебному проекту." } as const;
    const key = randomUUID(), appeal = await serviceA.createAppeal(input, key);
    expect((await serviceA.createAppeal(input, key)).id).toBe(appeal.id);
    expect(appeal.data.recentMessages).toHaveLength(1);
    const messageKey = randomUUID(), message = await serviceA.sendMessage(appeal.id, { body: "Спасибо, уточните дату консультации." }, messageKey);
    expect((await serviceA.sendMessage(appeal.id, { body: "Спасибо, уточните дату консультации." }, messageKey)).id).toBe(message.id);
    expect((await serviceA.messages(appeal.id)).filter(row => row.messageId === message.id)).toHaveLength(1);
    await expect(serviceB.messages(appeal.id)).rejects.toMatchObject({ status: 404 });
    await expect(serviceB.sendMessage(appeal.id, { body: "Чужое сообщение" }, randomUUID())).rejects.toMatchObject({ status: 404 });
    expect(await serviceB.resolve({ operationScope: "CREATE_APPEAL_MESSAGE", idempotencyKey: messageKey })).toMatchObject({ state: "NOT_FOUND" });
  });

  it("worker подтверждает только принятые источником операции без повторных переходов", async () => {
    const service = new OperationsService(a);
    const created = await service.createRequest({ requestTypeCode: "DEMO_APPLICATION", formSchemaVersion: "v1", submittedData: { subject: "Учебный вопрос", statementBody: "Прошу уточнить порядок выполнения учебной работы." } }, randomUUID());
    await administrationTick();
    const delivered = await service.request(created.id);
    expect(delivered.externalState).toBe("ACKNOWLEDGED");
    expect(delivered.businessStatus).toBe("SUBMITTED");
    const count = delivered.transitions.length;
    await administrationTick();
    expect((await service.request(created.id)).transitions).toHaveLength(count);
  });

  it("пять категорий и прочтение принадлежат каждому студенту отдельно", async () => {
    const serviceA = new CommunityService(a), serviceB = new CommunityService(b);
    const feedA = await serviceA.notifications(), feedB = await serviceB.notifications();
    expect(new Set(feedA.entries.map(entry => entry.item.category))).toEqual(new Set(categories));
    expect(new Set(feedB.entries.map(entry => entry.item.category))).toEqual(new Set(categories));
    const key = feedA.entries.find(entry => !entry.item.isRead)!.item.notificationKey;
    expect((await serviceA.markRead([key])).markedCount).toBe(1);
    expect((await serviceA.markRead([key])).alreadyReadCount).toBe(1);
    expect((await serviceA.notifications()).entries.find(entry => entry.item.notificationKey === key)?.item.isRead).toBe(true);
    await expect(serviceB.markRead([key])).rejects.toMatchObject({ status: 404 });
    expect(feedB.entries.every(entry => entry.item.notificationKey !== key)).toBe(true);
    const all = await serviceB.markRead();
    expect(all.markedCount).toBeGreaterThan(0);
    expect((await serviceB.notifications()).entries.every(entry => entry.item.isRead)).toBe(true);
  });

  it("экспорт требует ту же выборку, свежий подписанный token и тот же аккаунт", async () => {
    const selection = { from: "2026-11-01", to: "2026-11-30", eventKinds: ["ACADEMIC", "UNIVERSITY"] as Array<"ACADEMIC" | "UNIVERSITY"> };
    const serviceA = new CommunityService(a), serviceB = new CommunityService(b);
    const preview = await serviceA.preview(selection);
    const selected = await serviceA.export(selection, preview.selectionToken);
    expect(selected.length).toBe(preview.count);
    await expect(serviceA.export({ ...selection, eventKinds: ["UNIVERSITY"] }, preview.selectionToken)).rejects.toMatchObject({ status: 409 });
    await expect(serviceB.export(selection, preview.selectionToken)).rejects.toMatchObject({ status: 409 });
    await expect(serviceA.export(selection, `${preview.selectionToken}x`)).rejects.toMatchObject({ status: 409 });
  });

  it("демо-помощник не выдумывает ответ и не выполняет изменяющее действие", async () => {
    const irrelevant = await askAssistant(a, { message: "Какая погода на Марсе?" });
    expect(irrelevant.targets).toEqual([]);
    expect(irrelevant.text).not.toMatch(/погод[ауеы]/i);
    const blocked = await askAssistant(a, { message: "Измени мою оценку" });
    expect(blocked.targets).toEqual([]);
    expect(blocked.text).toMatch(/не изменяет|не редактирует/);
    const notifications = await askAssistant(a, { message: "Покажи мои уведомления", contextHint: "NOTIFICATIONS" });
    expect(notifications.providerMode).toBe("DEMO_MOCK");
    const allowedTargets = (await new CommunityService(a).notifications()).entries.map(entry => entry.item.target);
    expect(notifications.targets.length).toBeGreaterThan(0);
    expect(notifications.targets.every(target => allowedTargets.some(allowed => JSON.stringify(allowed) === JSON.stringify(target)))).toBe(true);
  });
});
