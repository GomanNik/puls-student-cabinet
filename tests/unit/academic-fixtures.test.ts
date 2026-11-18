import { describe, expect, it } from "vitest";
import { FixtureAcademicProvider, fixtureScenarios } from "@/server/integrations/fixture-provider";
import { SOURCE, fixtureAssignments, fixtureSchedule, periods, studentFixture } from "@/server/integrations/academic-fixtures";
import { fixtureLearning } from "@/server/integrations/learning-fixtures";
import { addDays } from "@/shared/lib/dates";

const a = "fixture-student-a", b = "fixture-student-b", periodId = "fall-2026";
const scope = { sourceCode: SOURCE, externalStudentId: a, periodId, offeringId: "a-fall-2026-math" };

describe("ТД-01–ТД-06, ТД-16–ТД-20: академические фикстуры", () => {
  it("два вымышленных студента имеют разные группы, дисциплины и подтверждённые memberships", () => {
    const first = studentFixture(a)!, second = studentFixture(b)!;
    expect(first.context.groupId).not.toBe(second.context.groupId);
    expect(first.offerings.some(item => item.title === "Математический анализ")).toBe(true);
    expect(second.offerings.some(item => item.title === "Математический анализ")).toBe(false);
    expect(first.context.memberships.every(item => item.externalStudentId === a && item.state === "CONFIRMED")).toBe(true);
    expect(second.context.memberships.every(item => item.externalStudentId === b && item.state === "CONFIRMED")).toBe(true);
    expect(studentFixture("real-student-id")).toBeNull();
  });

  it("подгруппы назначаются по дисциплине и дате, без ручного выбора", () => {
    const before = fixtureAssignments(a, periodId, "2026-11-13");
    const after = fixtureAssignments(a, periodId, "2026-11-16");
    const english = (items: typeof before) => items.find(item => item.offeringId.endsWith("english"))!;
    expect(english(before).subgroupLabel).toBe("Подгруппа 1");
    expect(english(after).subgroupLabel).toBe("Подгруппа 3");
    expect(after.find(item => item.offeringId.endsWith("math"))?.subgroupLabel).toBe("Подгруппа 2");
    expect(after.every(item => item.isOfficial)).toBe(true);
    expect(fixtureAssignments(b, periodId, "2026-11-16").every(item => item.externalStudentId === b)).toBe(true);
  });

  it("источник содержит три подгруппы, перенос и отмену с отдельными изменениями", async () => {
    const records = fixtureSchedule(a, periodId, "2026-11-13", "2026-11-16");
    const practice = records.filter(item => item.subgroupId);
    expect(new Set(practice.filter(item => item.offeringId.endsWith("math")).map(item => item.subgroupId)).size).toBe(3);
    expect(records.some(item => item.state === "RESCHEDULED" && item.room === "412")).toBe(true);
    expect(records.some(item => item.state === "CANCELLED")).toBe(true);
    const read = await new FixtureAcademicProvider().getChanges({ sourceCode: SOURCE, externalStudentId: a, periodId }, { from: "2026-11-13", to: "2026-11-16" });
    expect(read.items.every(item => item.sourceRevision === read.sourceRevision)).toBe(true);
  });

  it("осенний английский возвращает конечные 16 личных занятий без чужих подгрупп и повторов", async () => {
    const port = new FixtureAcademicProvider();
    const range = { from: "2026-09-01", to: "2027-01-31" };
    for (const student of [a, b]) {
      const person = { sourceCode: SOURCE, externalStudentId: student, periodId };
      const schedule = (await port.getSchedule(person, range)).items.filter(item => item.offeringId.endsWith("english"));
      const ids = new Set(schedule.map(item => item.ref.externalId));
      expect(schedule).toHaveLength(16);
      expect(ids.size).toBe(16);
      expect(schedule.every(item => item.periodId === periodId && item.occurrenceId >= range.from && item.occurrenceId <= range.to)).toBe(true);
      expect(schedule.every(item => !item.subgroupId || fixtureAssignments(student, periodId, item.occurrenceId).some(assignment => assignment.offeringId === item.offeringId && assignment.subgroupId === item.subgroupId))).toBe(true);
      const actual = (await port.getActualSessions(person, range)).items.filter(item => item.offeringId.endsWith("english"));
      const attendance = (await port.getAttendance(person, range)).items.filter(item => item.offeringId.endsWith("english"));
      expect(actual.every(item => schedule.some(entry => entry.scheduleEntryId === item.scheduleEntryId && entry.occurrenceId === item.occurrenceId))).toBe(true);
      expect(attendance.every(item => actual.some(session => session.sessionId === item.sessionId))).toBe(true);
      expect(attendance.filter(item => item.status === "PRESENT").length + attendance.filter(item => item.status === "ABSENT").length + attendance.filter(item => item.status === "OTHER_RECORDED").length + (schedule.length - attendance.length)).toBe(16);
    }
  });

  it("план занятия, подтверждённое проведение и посещение остаются разными сведениями", async () => {
    const port = new FixtureAcademicProvider(), person = { sourceCode: SOURCE, externalStudentId: a, periodId }, range = { from: "2026-11-03", to: "2026-11-11" };
    const schedule = await port.getSchedule(person, range), actual = await port.getActualSessions(person, range), attendance = await port.getAttendance(person, range);
    expect(schedule.items.length).toBeGreaterThan(actual.items.length);
    expect(actual.items.length).toBeGreaterThan(attendance.items.length);
    expect(actual.items.every(item => item.held === true)).toBe(true);
    expect(attendance.items.every(item => item.status === "PRESENT" || item.status === "ABSENT")).toBe(true);
    expect(schedule.items.some(item => !actual.items.some(session => session.scheduleEntryId === item.scheduleEntryId && session.occurrenceId === item.occurrenceId))).toBe(true);
  });

  it("нулевая оценка, отсутствие оценки и официальный итог различаются", () => {
    const current = fixtureLearning(scope);
    const archive = fixtureLearning({ ...scope, periodId: "spring-2026", offeringId: "a-spring-2026-math" });
    expect(current.assessments[0].valueState).toBe("KNOWN_ZERO");
    expect(current.assessments[0].value?.numeric).toBe("0");
    expect(current.courseResults[0].resultState).toBe("PENDING");
    expect(current.courseResults[0].result).toBeUndefined();
    expect(archive.courseResults[0].resultState).toBe("READY");
    expect(archive.courseResults[0].assessedAt).toBeTruthy();
    expect(current.attestations[0].kindLabel).toBe("Экзамен");
  });

  it("конспект как работа и Конспект.pdf как материал не смешиваются", () => {
    const history = fixtureLearning({ ...scope, offeringId: "a-fall-2026-history" });
    expect(history.works.some(item => item.workTypeCode === "ASSIGNED_NOTES")).toBe(true);
    const notes = history.materials.find(item => item.title === "Конспект.pdf");
    expect(notes).toBeTruthy();
    expect(notes?.relatedWorkRefs).toEqual([]);
    expect(history.materials.some(item => item.relatedWorkRefs && item.relatedWorkRefs.length > 0)).toBe(true);
  });

  it("сценарии источника различают пустой подтверждённый набор, неприменимость, неполноту и ошибку", async () => {
    for (const [scenario, availability, isComplete] of [
      ["works-no-data", "NO_DATA", true], ["works-not-applicable", "NOT_APPLICABLE", true],
      ["works-partial", "PARTIAL", false], ["works-error", "ERROR", false],
    ] as const) {
      expect(fixtureScenarios).toContain(scenario);
      const read = await new FixtureAcademicProvider(scenario).getWorks(scope);
      expect(read.availability).toBe(availability);
      expect(read.isComplete).toBe(isComplete);
      if (availability === "NO_DATA" || availability === "NOT_APPLICABLE" || availability === "ERROR") expect(read.items).toEqual([]);
    }
    await expect(new FixtureAcademicProvider("works-timeout").getWorks(scope)).rejects.toMatchObject({ status: 504 });
  });

  it("перенос срока меняет исходную работу и проекцию дедлайнов без второй даты", async () => {
    const before = new FixtureAcademicProvider("deadline-before"), moved = new FixtureAcademicProvider("deadline-moved");
    const original = (await before.getWorks(scope)).items[0];
    const updated = (await moved.getWorks(scope)).items[0];
    expect(updated.workId).toBe(original.workId);
    expect(updated.due?.on).toBe(addDays(moved.today(), 5));
    expect(original.due?.on).toBe(addDays(before.today(), 2));
    const deadlines = await moved.getDeadlines(scope);
    expect(deadlines.items.find(item => item.relatedWorkRef?.externalId === updated.ref.externalId)?.due).toEqual(updated.due);
  });

  it("каждый период ограничен исходными датами и не становится источником вымышленных занятий", () => {
    expect(periods.every(item => item.startsOn && item.endsOn && item.startsOn <= item.endsOn)).toBe(true);
    expect(fixtureSchedule(a, periodId, "2026-08-01", "2026-08-31")).toEqual([]);
    expect(fixtureSchedule(a, periodId, "2027-02-01", "2027-02-28")).toEqual([]);
  });
});
