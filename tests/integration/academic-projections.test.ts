import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AuthService } from "@/modules/auth/service";
import type { AuthContext } from "@/modules/auth/context";
import { learningService } from "@/modules/learning/composition";
import { learningHandler } from "@/modules/learning/handlers";
import { sessionCookie } from "@/shared/server/http";
import { attendanceSummary } from "@/modules/learning/discipline-content";
import { getWorkStatus } from "@/modules/learning/work-status";
import { CommunityService } from "@/modules/community/service";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { addDays } from "@/shared/lib/dates";
import { prepareTestDatabase, testDatabase } from "../support/database";

const admin = testDatabase();
let a: AuthContext, b: AuthContext, tokenA: string;
beforeAll(async () => {
  const fixture = await prepareTestDatabase(admin), service = new AuthService(database(), readConfig());
  const sessions = await Promise.all([service.login("demo-a", fixture.passwords[0], "127.0.0.1"), service.login("demo-b", fixture.passwords[1], "127.0.0.1")]);
  tokenA = sessions[0].token;
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
  it("личные группы двух студентов различаются, а курсоры сохраняют весь период", async () => {
    const authService = new AuthService(database(), readConfig());
    const groups = await Promise.all([a, b].map(async auth => (await authService.profile(auth)).group));
    expect(groups).toEqual(["ПИ-24-1", "ИК-23-2"]);
    const range = { from: "2026-11-16", to: "2026-11-29" };
    for (const auth of [a, b]) {
      const service = await learningService(auth, admin);
      const expected = await service.schedule.list(range, 100);
      const items = [];
      let cursor: string | undefined;
      do {
        const page = await service.schedule.list(range, 20, cursor);
        if (cursor) {
          const repeated = await service.schedule.list(range, 20, cursor);
          expect(repeated.data.items.map(item => item.scheduleId)).toEqual(page.data.items.map(item => item.scheduleId));
        }
        items.push(...page.data.items);
        cursor = page.data.nextCursor ?? undefined;
      } while (cursor);
      expect(items.map(item => item.scheduleId)).toEqual(expected.data.items.map(item => item.scheduleId));
      expect(new Set(items.map(item => item.scheduleId)).size).toBe(items.length);
      expect(items.map(item => item.plannedStart)).toEqual([...items.map(item => item.plannedStart)].sort());
      if (auth === a) expect(items.length).toBeGreaterThan(20);
    }
  });

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

  it("отмена остаётся в расписании с признаком, перенос сохраняет один актуальный экземпляр", async () => {
    const service = await learningService(a, admin);
    const list = await service.schedule.list({ from: "2026-11-13", to: "2026-11-16" }, 100);
    const cancelled = list.data.items.filter(item => item.status === "CANCELLED");
    const moved = list.data.items.filter(item => item.status === "RESCHEDULED");
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every(item => item.change?.changeKind === "CANCELLED")).toBe(true);
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every(item => item.change?.changeKind === "RESCHEDULED" && item.plannedStart?.includes("T16:40:00+06:00"))).toBe(true);
    expect(new Set(list.data.items.map(item => item.scheduleId)).size).toBe(list.data.items.length);
    expect(list.data.items.map(item => item.plannedStart)).toEqual([...list.data.items.map(item => item.plannedStart)].sort());
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

  it("показывает опубликованный результат работы как итоговый статус, включая ноль баллов", async () => {
    const { service, binding } = await subject(a, "Математический анализ");
    const list = await service.listWorks(binding, 100, undefined, { filter: "ALL", sort: "DUE", query: "" });
    const lab3 = list.data.items.find(item => item.title === "Лабораторная работа № 3")!;

    expect(lab3.publishedResult?.value.rawValueText).toBe("0 баллов");
    expect(getWorkStatus(lab3.progress, lab3.publishedResult)).toBe("RESULT_PUBLISHED");
    expect(getWorkStatus({ ...lab3.progress!, reviewedAt: undefined, reviewStatusCode: undefined }, lab3.publishedResult)).toBe("RESULT_PUBLISHED");

    const detail = await service.workDetail(binding, lab3.workId);
    expect(detail.data.work.publishedResult?.value.rawValueText).toBe("0 баллов");
    expect(detail.data.results.some(result => result.value.rawValueText === "0 баллов")).toBe(true);

    const review = await service.listWorks(binding, 100, undefined, { filter: "REVIEW", sort: "DUE", query: "" });
    expect(review.data.items).toHaveLength(1);
    expect(review.data.items.some(item => item.workId === lab3.workId)).toBe(false);
  });



  it("API списка результатов принимает фильтр RESULT и возвращает опубликованную работу", async () => {
    const { binding, periodId } = await subject(a, "Математический анализ");
    const request = new Request(`https://puls.test/api/v1/periods/${periodId}/offerings/${binding.publicContext}/works?limit=20&filter=RESULT`, {
      headers: {
        cookie: `${sessionCookie}=${tokenA}`,
        "x-puls-proxy-key": readConfig().TRUSTED_PROXY_KEY,
        "x-forwarded-proto": "https",
        "x-puls-client-ip": "127.0.0.1",
      },
    });
    const response = await learningHandler("works", Promise.resolve({ periodId, offeringId: binding.publicContext }))(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].title).toBe("Лабораторная работа № 3");
  });

  it("каталог материалов показывает только файлы, привязанные к конкретному занятию", async () => {
    const { binding, periodId } = await subject(a, "Математический анализ");
    const query = new URLSearchParams({ periodId, offeringId: binding.publicContext, limit: "20" });
    const request = new Request(`https://puls.test/api/v1/materials?${query}`, {
      headers: {
        cookie: `${sessionCookie}=${tokenA}`,
        "x-puls-proxy-key": readConfig().TRUSTED_PROXY_KEY,
        "x-forwarded-proto": "https",
        "x-puls-client-ip": "127.0.0.1",
      },
    });
    const response = await learningHandler("materials")(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.items.every((item: { relatedScheduleIds?: string[] }) => (item.relatedScheduleIds?.length ?? 0) > 0)).toBe(true);
    expect(body.data.items.some((item: { title: string }) => item.title === "Конспект.pdf")).toBe(true);
  });

  it("работы открываются постранично с номерами страниц и возвратом назад", async () => {
    const { service, binding } = await subject(a, "Математический анализ");
    const selection = { filter: "ALL" as const, sort: "DUE" as const, query: "" };
    const first = await service.listWorks(binding, 20, undefined, selection);
    expect(first.data).toMatchObject({ totalItems: 26, totalPages: 2, pageNumber: 1, previousCursor: null });
    expect(first.data.nextCursor).toBeTruthy();

    const second = await service.listWorks(binding, 20, first.data.nextCursor ?? undefined, selection);
    expect(second.data).toMatchObject({ totalItems: 26, totalPages: 2, pageNumber: 2, nextCursor: null });
    expect(second.data.previousCursor).toBeTruthy();
    expect(second.data.items).toHaveLength(6);
    const backToFirst = await service.listWorks(binding, 20, second.data.previousCursor ?? undefined, selection);
    expect(backToFirst.data.pageNumber).toBe(1);
    expect(backToFirst.data.items.map(item => item.workId)).toEqual(first.data.items.map(item => item.workId));
  });

  it("прикрепляет конспект к конкретной лекции, а не оставляет его без учебного контекста", async () => {
    const { service, binding, periodId } = await subject(a, "Математический анализ");
    const materials = await service.allMaterials({ periodId, offeringId: binding.publicContext });
    const note = materials.items.find(item => item.title === "Конспект.pdf");
    expect(note?.relatedScheduleIds).toHaveLength(1);
    const lesson = await service.schedule.detail(note!.relatedScheduleIds![0]);
    expect(lesson.data.schedule.offeringId).toBe(binding.publicContext);
    expect(lesson.data.schedule.lessonType).toBe("Лекция");
  });

  it("материалы содержат сведения о связанных занятиях", async () => {
    const { service, binding } = await subject(a, "История России");
    const result = await service.materials(binding);
    const material = result.items.find(item => item.relatedLessons?.length);
    expect(material).toBeDefined();

    const lesson = material!.relatedLessons![0]!;
    const detail = await service.schedule.detail(lesson.scheduleId);
    expect(lesson.disciplineTitle).toBe(binding.title);
    expect(lesson.plannedStart).toBe(detail.data.schedule.plannedStart);
    expect(lesson.timeZone).toBe(detail.data.schedule.timeZone);
    expect(lesson.topic).toBe(detail.data.actual?.topic);
    expect(material!.relatedScheduleIds).toContain(lesson.scheduleId);
  });

  it("считает все работы дисциплины, а не только карточки первой страницы", async () => {
    const { service, binding } = await subject(a, "Математический анализ");
    const detail = await service.offeringDetail(binding);

    expect(detail.data.works).toHaveLength(20);
    expect(detail.data.worksState.nextCursor).toBeTruthy();
    expect(detail.data.workCounts).toEqual({ total: 26, reviewed: 1, awaitingReview: 1 });
  });

  it("не показывает приблизительные количества при неполном списке работ", async () => {
    await scenario("partial-works", async () => {
      const { service, binding } = await subject(a, "Математический анализ");
      const detail = await service.offeringDetail(binding);
      expect(detail.data.workCounts).toEqual({ total: null, reviewed: null, awaitingReview: null });
    });
  });

  it("возвращает опубликованные результаты через фильтр списка работ", async () => {
    const { service, binding } = await subject(a, "Математический анализ");
    const results = await service.listWorks(binding, 20, undefined, { filter: "RESULT", sort: "DUE", query: "" });

    expect(results.data.items).toHaveLength(1);
    expect(results.data.items[0].title).toBe("Лабораторная работа № 3");
    expect(results.data.items[0].publishedResult?.value.rawValueText).toBe("0 баллов");
  });

});
