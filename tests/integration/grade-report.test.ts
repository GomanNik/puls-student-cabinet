import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AuthService } from "@/modules/auth/service";
import type { AuthContext } from "@/modules/auth/context";
import { learningService } from "@/modules/learning/composition";
import { GradeReportResponseSchema } from "@/modules/learning/grades-contract";
import { GET as gradeReportRoute } from "@/app/api/v1/periods/[periodId]/grades/route";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { prepareTestDatabase, testDatabase } from "../support/database";
import { contractAccepts } from "../support/contract";

const admin = testDatabase();
let a: AuthContext, b: AuthContext;
let tokens: string[];
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin);
  const service = new AuthService(database(), readConfig());
  const sessions = await Promise.all([
    service.login("demo-a", fixture.passwords[0], "127.0.0.1"),
    service.login("demo-b", fixture.passwords[1], "127.0.0.1"),
  ]);
  tokens = sessions.map(session => session.token);
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
  it("Route Handler возвращает JSON по OpenAPI, 401 без сессии и одинаковый 404 для чужого и неизвестного периода", async () => {
    const own = await period(a, "spring-2026");
    const foreign = await period(b, "spring-2026");
    const headers = { "x-puls-proxy-key": readConfig().TRUSTED_PROXY_KEY, "x-forwarded-proto": "https", "x-puls-client-ip": "127.0.0.1" };
    const call = (periodId: string, token?: string) => gradeReportRoute(new Request(`https://localhost/api/v1/periods/${encodeURIComponent(periodId)}/grades`, {
      headers: { ...headers, ...(token ? { Cookie: `__Host-puls_session=${token}` } : {}) },
    }), { params: Promise.resolve({ periodId }) });
    const successful = await call(own.id, tokens[0]);
    expect(successful.status).toBe(200);
    const json = await successful.json();
    expect(GradeReportResponseSchema.safeParse(json).success).toBe(true);
    expect(contractAccepts("GradeReportResponse", json)).toBe(true);
    expect(json.data.items).toHaveLength(4);
    expect((await call(own.id)).status).toBe(401);
    const unknown = await call("unknown-period", tokens[0]);
    const denied = await call(foreign.id, tokens[0]);
    expect([unknown.status, denied.status]).toEqual([404, 404]);
    expect((await unknown.json()).error.code).toBe("NOT_FOUND");
    expect((await denied.json()).error.code).toBe("NOT_FOUND");
    const invalidQuery = await gradeReportRoute(new Request(`https://localhost/api/v1/periods/${own.id}/grades?unexpected=1`, {
      headers: { ...headers, Cookie: `__Host-puls_session=${tokens[0]}` },
    }), { params: Promise.resolve({ periodId: own.id }) });
    expect(invalidQuery.status).toBe(422);
  });

  it("подтверждённый пустой источник дисциплин даёт пустую ведомость, а не ошибку или нулевые оценки", async () => {
    const own = await period(a, "fall-2026");
    const previous = process.env.PULS_FIXTURE_SCENARIO;
    process.env.PULS_FIXTURE_SCENARIO = "offerings-no-data";
    try {
      const response = await gradeReportRoute(new Request(`https://localhost/api/v1/periods/${own.id}/grades`, {
        headers: { "x-puls-proxy-key": readConfig().TRUSTED_PROXY_KEY, "x-forwarded-proto": "https", "x-puls-client-ip": "127.0.0.1", Cookie: `__Host-puls_session=${tokens[0]}` },
      }), { params: Promise.resolve({ periodId: own.id }) });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toMatchObject({ items: [], isComplete: true, dataState: "EMPTY_CONFIRMED" });
      expect(contractAccepts("GradeReportResponse", body)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.PULS_FIXTURE_SCENARIO;
      else process.env.PULS_FIXTURE_SCENARIO = previous;
    }
  });
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
