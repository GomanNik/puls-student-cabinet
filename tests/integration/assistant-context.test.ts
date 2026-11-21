import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import type { AuthContext } from "@/modules/auth/context";
import { AuthService } from "@/modules/auth/service";
import { askAssistant } from "@/modules/assistant/service";
import { CommunityService } from "@/modules/community/service";
import { OperationsService } from "@/modules/operations/service";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { prepareTestDatabase, testDatabase } from "../support/database";

const admin = testDatabase();
let a: AuthContext, b: AuthContext;
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin), auth = new AuthService(database(), readConfig());
  const sessions = await Promise.all([auth.login("demo-a", fixture.passwords[0], "127.0.0.1"), auth.login("demo-b", fixture.passwords[1], "127.0.0.1")]);
  [a, b] = await Promise.all(sessions.map(session => auth.requireSession(session.token, randomUUID())));
});
beforeEach(async () => {
  const secret = readConfig().AUTH_RATE_LIMIT_HMAC_KEY;
  const keyDigest = [a, b].flatMap(auth => [60, 3600].map(window => createHmac("sha256", secret).update(JSON.stringify(["assistant", auth.accountId, window])).digest()));
  await admin.authRateBucket.deleteMany({ where: { keyDigest: { in: keyDigest } } });
});
afterAll(async () => { delete process.env.PULS_AI_FIXTURE_SCENARIO; await admin.$disconnect(); await database().$disconnect(); });
async function mode<T>(value: string, action: () => Promise<T>): Promise<T> {
  const previous = process.env.PULS_AI_FIXTURE_SCENARIO;
  process.env.PULS_AI_FIXTURE_SCENARIO = value;
  try { return await action(); }
  finally { if (previous === undefined) delete process.env.PULS_AI_FIXTURE_SCENARIO; else process.env.PULS_AI_FIXTURE_SCENARIO = previous; }
}

describe("помощник в подтверждённом контексте студента", () => {
  it("находит преподавателей только по разрешённым дисциплинам и расписанию", async () => {
    const [forA, forB] = await Promise.all([
      askAssistant(a, { message: "Кто ведёт историю России?" }),
      askAssistant(b, { message: "Какие преподаватели ведут занятия у моей группы?" }),
    ]);
    expect(forA.text).toContain("История России");
    expect(forA.text).toContain("Светлов Павел Андреевич");
    expect(forA.text).not.toContain("Культурное наследие");
    expect(forB.text).toContain("Культурное наследие России");
    expect(forB.text).not.toContain("Математический анализ");
  });

  it("продолжение разговора не повторяет уже перечисленных преподавателей", async () => {
    const first = await askAssistant(a, { message: "Какие преподаватели ведут занятия у моей группы?" });
    const second = await askAssistant(a, { message: "А какие ещё преподаватели есть?", history: [
      { role: "user", content: "Какие преподаватели ведут занятия у моей группы?" },
      { role: "assistant", content: first.text },
    ] });
    expect(second.text).toContain("Других преподавателей");
    expect(second.targets).toEqual([]);
  });

  it("не скрывает подтверждённый нулевой балл за общим отсутствием итогов", async () => {
    const answer = await askAssistant(a, { message: "Какие у меня результаты за семестр?" });
    expect(answer.text).toContain("0 баллов");
    expect(answer.text).toContain("Математический анализ");
  });

  it("недоступное расписание не превращает в сообщение об отсутствии занятий", async () => {
    const previous = process.env.PULS_FIXTURE_SCENARIO;
    process.env.PULS_FIXTURE_SCENARIO = "schedule-error";
    try {
      const answer = await askAssistant(a, { message: "Какие занятия у меня завтра?" });
      expect(answer.completeness).toBe("UNKNOWN");
      expect(answer.targets).toEqual([]);
      expect(answer.text).toContain("Не удалось проверить");
      expect(answer.text).not.toContain("занятий нет");
    } finally {
      if (previous === undefined) delete process.env.PULS_FIXTURE_SCENARIO;
      else process.env.PULS_FIXTURE_SCENARIO = previous;
    }
  });
  it("уведомления ссылаются только на разрешённые объекты текущего аккаунта", async () => {
    const [answerA, answerB] = await Promise.all([askAssistant(a, { message: "Покажи мои уведомления", contextHint: "NOTIFICATIONS" }), askAssistant(b, { message: "Покажи мои уведомления", contextHint: "NOTIFICATIONS" })]);
    const keysA = new Set((await new CommunityService(a).notifications()).entries.map(entry => JSON.stringify(entry.item.target)));
    const keysB = new Set((await new CommunityService(b).notifications()).entries.map(entry => JSON.stringify(entry.item.target)));
    expect(answerA.targets.length).toBeGreaterThan(0);
    expect(answerB.targets.length).toBeGreaterThan(0);
    expect(answerA.targets.every(target => keysA.has(JSON.stringify(target)))).toBe(true);
    expect(answerB.targets.every(target => keysB.has(JSON.stringify(target)))).toBe(true);
    expect(answerA.targets.some(target => keysB.has(JSON.stringify(target)) && !keysA.has(JSON.stringify(target)))).toBe(false);
  });

  it("неподдерживаемый вопрос не получает похожий, но нерелевантный академический факт", async () => {
    const answer = await askAssistant(a, { message: "Какая погода на Марсе?" });
    expect(answer.completeness).toBe("UNKNOWN");
    expect(answer.targets).toEqual([]);
    expect(answer.text).toContain("не поддерживается");
    expect(answer.text).not.toMatch(/оценка:|Занятие:|Материал:/);
  });

  it("ошибка и таймаут демонстрационного ИИ помечаются как неподтверждённый ответ", async () => {
    for (const scenario of ["error", "timeout"]) {
      const answer = await mode(scenario, () => askAssistant(a, { message: "Покажи мои уведомления", contextHint: "NOTIFICATIONS" }));
      expect(answer.providerMode).toBe("DEMO_MOCK");
      expect(answer.completeness).toBe("UNKNOWN");
      expect(answer.targets).toEqual([]);
      expect(answer.notice).toContain("недоступен");
    }
  });

  it("частичный ответ и отсутствие данных не объявляются полными", async () => {
    const partial = await mode("partial", () => askAssistant(a, { message: "Покажи мои уведомления", contextHint: "NOTIFICATIONS" }));
    expect(partial.completeness).not.toBe("COMPLETE");
    const empty = await mode("no-data", () => askAssistant(a, { message: "Покажи мои уведомления", contextHint: "NOTIFICATIONS" }));
    expect(empty.completeness).toBe("UNKNOWN");
    expect(empty.targets).toEqual([]);
  });

  it("просьба изменить оценку не создаёт административных операций", async () => {
    const before = {
      requests: await admin.studentRequest.count({ where: { ownerAccountId: a.accountId } }),
      appeals: await admin.studentAppeal.count({ where: { ownerAccountId: a.accountId } }),
    };
    const answer = await askAssistant(a, { message: "Измени мою оценку" });
    expect(answer.targets).toEqual([]);
    expect(answer.text).toMatch(/не изменяет|не редактирует/);
    expect(await admin.studentRequest.count({ where: { ownerAccountId: a.accountId } })).toBe(before.requests);
    expect(await admin.studentAppeal.count({ where: { ownerAccountId: a.accountId } })).toBe(before.appeals);
    expect(await new OperationsService(a).requests()).toEqual([]);
  });

  it("поиск отсутствующей дисциплины не подставляет предмет другого студента", async () => {
    const answer = await askAssistant(a, { message: "Покажи работы по культурному наследию", contextHint: "STUDY" });
    expect(answer.completeness).toBe("COMPLETE");
    expect(answer.targets).toEqual([]);
    expect(answer.text).toContain("совпадений не найдено");
  });

  it("разговорные названия дисциплин и общие слова направляют запрос к учебным данным", async () => {
    const english = await askAssistant(a, { message: "Что у меня по английскому?" });
    const week = await askAssistant(a, { message: "Что по предметам на этой неделе?" });
    expect(english.text).toContain("Иностранный язык");
    expect(week.text).toContain("Занятие:");
    expect(english.targets.length).toBeGreaterThan(0);
    expect(week.targets.length).toBeGreaterThan(0);
  });
});
