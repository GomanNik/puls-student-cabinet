import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AuthService } from "@/modules/auth/service";
import type { AuthContext } from "@/modules/auth/context";
import { learningService } from "@/modules/learning/composition";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { prepareTestDatabase, testDatabase } from "../support/database";

const admin = testDatabase();
let a: AuthContext, b: AuthContext;
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin);
  const service = new AuthService(database(), readConfig());
  const sessions = await Promise.all([
    service.login("demo-a", fixture.passwords[0], "127.0.0.1"),
    service.login("demo-b", fixture.passwords[1], "127.0.0.1"),
  ]);
  [a, b] = await Promise.all(sessions.map(session => service.requireSession(session.token, randomUUID())));
});
afterAll(async () => { await admin.$disconnect(); await database().$disconnect(); });

async function period(auth: AuthContext, sourceId: string) {
  const service = await learningService(auth);
  const raw = service.context.record.periods.find(value => value.periodId === sourceId);
  if (!raw) throw new Error("Нет ожидаемого тестового периода");
  return { service, id: service.context.periodId(raw) };
}

describe("Оценки: официальная ведомость по семестрам", () => {
  it("осенний семестр содержит ожидаемые итоги, архивный — выставленные", async () => {
    const current = await period(a, "fall-2026");
    const archived = await period(a, "spring-2026");
    const fall = await current.service.gradeReport(current.id);
    const spring = await archived.service.gradeReport(archived.id);
    expect(fall.data.items).toHaveLength(4);
    expect(fall.data.items.every(row => row.resultState === "PENDING" && !row.value)).toBe(true);
    expect(spring.data.items.some(row => row.title === "Математический анализ" && row.value?.text === "Хорошо")).toBe(true);
    expect(spring.data.items.some(row => row.title === "История России" && row.value?.text === "Зачтено")).toBe(true);
  });

  it("ведомость demo-b не содержит предметов demo-a", async () => {
    const first = await period(a, "fall-2026"), second = await period(b, "fall-2026");
    const [aReport, bReport] = await Promise.all([first.service.gradeReport(first.id), second.service.gradeReport(second.id)]);
    expect(aReport.data.items.some(item => item.title === "Математический анализ")).toBe(true);
    expect(bReport.data.items.some(item => item.title === "Математический анализ")).toBe(false);
    expect(bReport.data.items.some(item => item.title === "Культурное наследие России")).toBe(true);
    expect(aReport.data.items.some(item => item.title === "Культурное наследие России")).toBe(false);
    expect(() => second.service.context.period(first.id)).toThrow();
  });
});
