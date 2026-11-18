import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AuthService } from "@/modules/auth/service";
import type { AuthContext } from "@/modules/auth/context";
import { learningService } from "@/modules/learning/composition";
import { attendanceSummary } from "@/modules/learning/discipline-content";
import { CommunityService } from "@/modules/community/service";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { addDays } from "@/shared/lib/dates";
import { prepareTestDatabase, testDatabase } from "../support/database";

const admin = testDatabase();
let a: AuthContext, b: AuthContext;
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin), service = new AuthService(database(), readConfig());
  const sessions = await Promise.all([service.login("demo-a", fixture.passwords[0], "127.0.0.1"), service.login("demo-b", fixture.passwords[1], "127.0.0.1")]);
  [a, b] = await Promise.all(sessions.map(session => service.requireSession(session.token, randomUUID())));
});
afterAll(async () => { await admin.$disconnect(); await database().$disconnect(); });

async function scenario<T>(name: string, action: () => Promise<T>): Promise<T> {
  const previous = process.env.PULS_FIXTURE_SCENARIO;
  process.env.PULS_FIXTURE_SCENARIO = name;
  try { return await action(); }
  finally { if (previous === undefined) delete process.env.PULS_FIXTURE_SCENARIO; else process.env.PULS_FIXTURE_SCENARIO = previous; }
}
async function subject(auth: AuthContext, title: string, archived = false) {
  const service = await learningService(auth, admin);
  const period = service.context.record.periods.find(item => archived ? item.periodId === "spring-2026" : item.periodId === "fall-2026")!;
  const periodId = service.context.periodId(period);
  for await (const binding of service.bindings(periodId)) if (binding.title === title) return { service, binding, periodId };
  throw Error(`Не найдена дисциплина: ${title}`);
}

describe("официальные учебные проекции и частичная доступность", () => {
  it("API занятий английского завершает выборку после 16 записей и сводка совпадает с журналом", async () => {
    for (const auth of [a, b]) {
      const { service, binding, periodId } = await subject(auth, "Иностранный язык");
      const page = await service.schedule.sessions(periodId, binding.publicContext, { from: "2026-09-01", to: "2027-01-31" }, 20);
      expect(page.data.items).toHaveLength(16);
      expect(page.data.nextCursor).toBeNull();
      expect(new Set(page.data.items.map(item => item.schedule.scheduleId)).size).toBe(16);
      expect(page.data.items.every(item => item.schedule.offeringId === binding.publicContext && item.schedule.periodId === periodId)).toBe(true);
      const present = page.data.items.filter(item => item.attendance?.status === "PRESENT").length;
      const absent = page.data.items.filter(item => item.attendance?.status === "ABSENT").length;
      const other = page.data.items.filter(item => item.attendance?.status === "OTHER_RECORDED").length;
      const withoutMark = page.data.items.filter(item => !item.attendance && item.attendanceState !== "SOURCE_ERROR").length;
      expect(present + absent + other + withoutMark).toBe(16);
      expect(attendanceSummary(page.data)).toContain(`16. Присутствий: ${present}; пропусков: ${absent}; иных отметок: ${other}; без отметки: ${withoutMark}`);
    }
  });

  it.each(["missing-assignment", "conflicting-assignment"])("%s не показывает чужую подгруппу как личную", async name => {
    await scenario(name, async () => {
      const { service } = await subject(a, "Иностранный язык");
      const list = await service.schedule.list({ from: "2026-11-16", to: "2026-11-20" }, 100);
      const english = list.data.items.filter(item => item.title === "Иностранный язык");
      expect(english.length).toBeGreaterThan(0);
      expect(english.every(item => !item.subgroupLabel)).toBe(true);
      expect(list.meta.completeness).toBe(false);
    });
  });

  it("подмешанная источником чужая запись не появляется в расписании", async () => {
    await scenario("invalid-scope", async () => {
      const { service } = await subject(a, "Математический анализ");
      const list = await service.schedule.list({ from: "2026-11-16", to: "2026-11-20" }, 100);
      expect(list.data.items.length).toBeGreaterThan(0);
      expect(list.data.items.every(item => item.offeringId && item.title !== "foreign-offering")).toBe(true);
      expect(list.meta.completeness).toBe(false);
    });
  });

  it("ошибка работ, пустой набор с осиротевшим прогрессом и неполный ответ имеют разные исходы", async () => {
    await scenario("works-error", async () => {
      const { service, binding } = await subject(a, "Математический анализ");
      await expect(service.listWorks(binding, 10)).rejects.toMatchObject({ status: 503 });
    });
    await scenario("works-no-data", async () => {
      const { service, binding } = await subject(a, "Математический анализ");
      const list = await service.listWorks(binding, 10);
      // Источник работ подтвердил пустоту, но источник прогресса ещё прислал
      // ссылки на работы: совокупный ответ нельзя объявлять полным.
      expect(list.data).toMatchObject({ items: [], dataState: "UNKNOWN", isComplete: false });
      expect(list.meta.sourceStatus).toBe("PARTIAL");
    });
    await scenario("partial-works", async () => {
      const { service, binding } = await subject(a, "Математический анализ");
      const list = await service.listWorks(binding, 10);
      expect(list.data.items.length).toBeGreaterThan(0);
      expect(list.data.isComplete).toBe(false);
      expect(list.meta.sourceStatus).toBe("PARTIAL");
    });
  });

  it("ноль баллов и ожидаемый официальный результат не превращаются в отсутствие оценки", async () => {
    const current = await subject(a, "Математический анализ"), archived = await subject(a, "Математический анализ", true);
    const now = (await current.service.results(current.binding)).data;
    const past = (await archived.service.results(archived.binding)).data;
    expect(now.components.some(item => item.state === "KNOWN_ZERO" && item.value?.numeric === "0")).toBe(true);
    expect(now.officialResultState).toBe("PENDING");
    expect(now.officialResult?.value).toBeUndefined();
    expect(past.officialResultState).toBe("READY");
    expect(past.officialResult?.assessedAt).toBeTruthy();
    expect(now.attestations.some(item => item.kindLabel === "Экзамен")).toBe(true);
  });

  it("одна дисциплина двух периодов не смешивает работы и официальные результаты", async () => {
    const current = await subject(a, "Математический анализ"), archived = await subject(a, "Математический анализ", true);
    const live = await current.service.listWorks(current.binding, 100), past = await archived.service.listWorks(archived.binding, 100);
    expect(live.data.items.length).toBeGreaterThan(0);
    expect(past.data.items.length).toBeGreaterThan(0);
    expect(live.data.items.every(item => item.periodId === current.periodId)).toBe(true);
    expect(past.data.items.every(item => item.periodId === archived.periodId)).toBe(true);
    const archivedIds = new Set(past.data.items.map(item => item.workId));
    expect(live.data.items.some(item => archivedIds.has(item.workId))).toBe(false);
  });

  it("материалы с недопустимым URL не передаются студенту как безопасная ссылка", async () => {
    await scenario("materials-invalid-link", async () => {
      const { service } = await subject(a, "История России");
      const materials = await service.allMaterials({});
      expect(materials.items.every(item => !item.safeExternalUrl || item.safeExternalUrl.startsWith("https://"))).toBe(true);
      expect(materials.meta.completeness).toBe(false);
    });
  });

  it("при недоступном календарном источнике учебные события остаются видимы, экспорт закрыт", async () => {
    const previous = process.env.PULS_COMMUNITY_FIXTURE_SCENARIO;
    process.env.PULS_COMMUNITY_FIXTURE_SCENARIO = "calendar-error";
    try {
      const service = new CommunityService(a, admin), selection = { from: "2026-11-01", to: "2026-11-30", eventKinds: ["UNIVERSITY", "ACADEMIC"] as Array<"UNIVERSITY" | "ACADEMIC"> };
      const calendar = await service.calendar(selection);
      expect(calendar.complete).toBe(false);
      expect(calendar.meta.completenessByDataset?.calendar).toBe(false);
      expect(calendar.items.some(item => item.origin === "ACADEMIC_DEADLINE")).toBe(true);
      await expect(service.preview(selection)).rejects.toMatchObject({ status: 503, code: "SOURCE_INCOMPLETE" });
    } finally { if (previous === undefined) delete process.env.PULS_COMMUNITY_FIXTURE_SCENARIO; else process.env.PULS_COMMUNITY_FIXTURE_SCENARIO = previous; }
  });

  it("перенос срока меняет ту же работу и календарную проекцию без нового ID", async () => {
    const read = async (name: string) => scenario(name, async () => {
      const { service, binding } = await subject(a, "Математический анализ");
      const work = (await service.listWorks(binding, 100)).data.items.find(item => /^Лабораторная работа № 1(?:$|:)/u.test(item.title))!;
      const today = service.context.today, calendar = await new CommunityService(a, admin).calendar({ from: today, to: addDays(today, 10), eventKinds: ["ACADEMIC"] });
      const event = calendar.items.find(item => /Лабораторная работа № 1(?:$|:)/u.test(item.title))!;
      return { work, event, today };
    });
    const before = await read("deadline-before"), moved = await read("deadline-moved");
    expect(before.work.workId).toBe(moved.work.workId);
    expect(before.event.eventKey).toBe(moved.event.eventKey);
    expect(before.work.due?.on).toBe(addDays(before.today, 2));
    expect(moved.work.due?.on).toBe(addDays(moved.today, 5));
    expect(moved.event.starts).toEqual(moved.work.due);
  });

  it("чужие публичные идентификаторы периода и дисциплины не расширяют полномочия", async () => {
    const ownB = await subject(b, "Культурное наследие России"), ownA = await subject(a, "Математический анализ");
    await expect(ownA.service.bind(ownB.periodId, ownB.binding.publicContext, "OFFERING")).rejects.toMatchObject({ status: 404 });
    await expect(ownA.service.bind(ownA.periodId, ownB.binding.publicContext, "OFFERING")).rejects.toMatchObject({ status: 404 });
  });
});
