import "server-only";
import type { AcademicPeriod, Assignment, Audience, ContextRecord, ExternalRef, Offering, ScheduleRecord, ScheduleChange, ActualClass, Attendance } from "./contracts";
import { addDays, daysBetween } from "@/shared/lib/dates";

export const SOURCE = "UNIVERSITY_FIXTURE";
export const FIXTURE_REVISION = "academic-2026-11-18-2";
const lectureTeachers = ["Воронова Елена Сергеевна", "Светлов Павел Андреевич", "Миронова Ирина Олеговна", "Белов Денис Сергеевич"];
// Конечный демонстрационный набор уже существовавших дат для осеннего английского.
// На каждой дате источник содержит общегрупповую лекцию и практику своей подгруппы.
const fallEnglishMeetingDays = new Set(["2026-09-04", "2026-09-25", "2026-10-16", "2026-11-06", "2026-11-20", "2026-12-18", "2027-01-08", "2027-01-15"]);
export const ref = (kind: string, id: string): ExternalRef => ({ sourceCode: SOURCE, objectKind: kind, externalId: id });
const stableNumber = (id: string) => [...id].reduce((sum, character) => (sum * 31 + character.codePointAt(0)!) >>> 0, 7);
export const periods: AcademicPeriod[] = [
  { ref: ref("ACADEMIC_PERIOD", "fall-2026"), periodId: "fall-2026", label: "Осенний семестр 2026/27", startsOn: "2026-09-01", endsOn: "2027-01-31" },
  { ref: ref("ACADEMIC_PERIOD", "spring-2026"), periodId: "spring-2026", label: "Весенний семестр 2025/26", startsOn: "2026-02-01", endsOn: "2026-06-30" },
];
export function studentFixture(externalStudentId: string) {
  const key = externalStudentId === "fixture-student-a" ? "a" : externalStudentId === "fixture-student-b" ? "b" : null;
  if (!key) return null;
  const groupId = `group-${key}`, facultyId = `faculty-${key}`, programId = `program-${key}`;
  const offerings: Offering[] = periods.flatMap(period => (key === "a" ? [
    ["math", "Математический анализ"], ["history", "История России"], ["english", "Иностранный язык"], ["pe", "Физическая культура"],
  ] : [["history", "История России"], ["english", "Иностранный язык"], ["heritage", "Культурное наследие России"]]).map(([slug, title], index) => {
    const offeringId = `${key}-${period.periodId}-${slug}`;
    return { ref: ref("OFFERING", offeringId), periodId: period.periodId, offeringId, title, teacherLabel: lectureTeachers[index], groupId,
      membershipRef: ref("MEMBERSHIP", `${externalStudentId}:${offeringId}`) };
  }));
  const context: ContextRecord = { ref: ref("STUDENT_CONTEXT", externalStudentId), externalStudentId, facultyId, programId, groupId, course: key === "a" ? 2 : 3,
    periods, memberships: offerings.map(o => ({ membershipRef: o.membershipRef, externalStudentId, periodId: o.periodId, offeringId: o.offeringId, state: "CONFIRMED" })) };
  return { key, context, offerings };
}
export function fixtureAssignments(externalStudentId: string, periodId: string, on?: string): Assignment[] {
  const student = studentFixture(externalStudentId);
  return (student?.offerings ?? []).filter(o => o.periodId === periodId).map(o => {
    // Официальная смена назначения с 16 ноября: история до этой даты остаётся своей.
    const index = o.offeringId.endsWith("english") ? student!.key === "a" ? periodId === "fall-2026" && on && on >= "2026-11-16" ? 3 : 1 : 3 : o.offeringId.endsWith("math") ? 2 : student!.key === "a" ? 1 : 2;
    return { ref: ref("ASSIGNMENT", `${externalStudentId}:${o.offeringId}`), externalStudentId, periodId, offeringId: o.offeringId,
      subgroupId: `${o.offeringId}-subgroup-${index}`, subgroupLabel: `Подгруппа ${index}`, isOfficial: true };
  });
}
// Три и более подгрупп существуют в источнике; клиенту передаётся только назначенная.
export function fixtureSchedule(externalStudentId: string, periodId: string, from: string, to: string): ScheduleRecord[] {
  const student = studentFixture(externalStudentId), period = periods.find(p => p.periodId === periodId);
  if (!student || !period || !period.startsOn || !period.endsOn) return [];
  const offerings = student.offerings.filter(o => o.periodId === periodId);
  const result: ScheduleRecord[] = [];
  const start = from > period.startsOn ? from : period.startsOn, end = to < period.endsOn ? to : period.endsOn;
  for (let i = 0; i <= daysBetween(start, end); i++) {
    const day = addDays(start, i), weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const [index, offering] of offerings.entries()) {
      if (periodId === "fall-2026" && offering.offeringId.endsWith("-english") && !fallEnglishMeetingDays.has(day)) continue;
      if ((weekday + index) % 2 !== 0 && weekday !== 5) continue;
      const slot = index === 0 ? "09:00" : index === 1 ? "10:50" : "13:00";
      const endSlot = index === 0 ? "10:30" : index === 1 ? "12:20" : "14:30";
      const common: Audience[] = [{ scopeType: "GROUP", scopeId: student.context.groupId! }];
      const baseId = `${offering.offeringId}:${weekday}:lecture`;
      result.push({ ref: ref("SCHEDULE", `${baseId}:${day}`), scheduleEntryId: baseId, occurrenceId: day, periodId, offeringId: offering.offeringId,
        title: offering.title, lessonType: "Лекция", startsAt: `${day}T${slot}:00+06:00`, endsAt: `${day}T${endSlot}:00+06:00`, timeZone: "Asia/Omsk",
        room: index === 3 ? "Спортивный зал" : index === 1 ? "214" : "305", teacherLabel: offering.teacherLabel, state: "PLANNED", audiences: common });
      for (let subgroup = 1; subgroup <= 3; subgroup++) {
        const subgroupId = `${offering.offeringId}-subgroup-${subgroup}`, scheduleEntryId = `${offering.offeringId}:${weekday}:practice:${subgroup}`;
        const changed = day === "2026-11-13" && index === 0;
        const cancelled = day === "2026-11-16" && index === 1;
        result.push({ ref: ref("SCHEDULE", `${scheduleEntryId}:${day}`), scheduleEntryId, occurrenceId: day, periodId, offeringId: offering.offeringId,
          title: offering.title, lessonType: offering.offeringId.endsWith("math") ? "Лабораторная работа" : "Практическое занятие",
          startsAt: `${day}T${changed ? "16:40" : "15:00"}:00+06:00`, endsAt: `${day}T${changed ? "18:10" : "16:30"}:00+06:00`, timeZone: "Asia/Omsk",
          room: changed ? "412" : "308", teacherLabel: "Зорина Татьяна Викторовна", state: cancelled ? "CANCELLED" : changed ? "RESCHEDULED" : "PLANNED",
          subgroupId, audiences: [{ scopeType: "SUBGROUP", scopeId: subgroupId, offeringId: offering.offeringId }] });
      }
    }
  }
  return result;
}
export function fixtureChanges(records: ScheduleRecord[]): ScheduleChange[] {
  return records.filter(r => r.state !== "PLANNED").map(r => ({ ref: ref("SCHEDULE_CHANGE", `${r.ref.externalId}:change-1`), scheduleEntryId: r.scheduleEntryId,
    occurrenceId: r.occurrenceId, changeId: `${r.ref.externalId}:change-1`, sourceRevision: FIXTURE_REVISION, changeKind: r.state === "CANCELLED" ? "CANCELLED" : "RESCHEDULED",
    occurredAt: "2026-11-12T08:00:00+06:00", description: r.state === "CANCELLED" ? "Источник сообщил об отмене занятия." : "Занятие перенесено с 15:00–16:30, аудитория 308. Актуальное время: 16:40–18:10, аудитория 412." }));
}
export function fixtureActual(records: ScheduleRecord[]): ActualClass[] {
  // Только явно зафиксированные занятия. Текущие/будущие планы не становятся фактами.
  return records.filter(r => r.occurrenceId <= "2026-11-11" && r.state !== "CANCELLED").filter(r => stableNumber(r.ref.externalId) % 4 !== 0).map(r => ({ ref: ref("ACTUAL_SESSION", `${r.ref.externalId}:held`),
    sessionId: `${r.ref.externalId}:held`, scheduleEntryId: r.scheduleEntryId, occurrenceId: r.occurrenceId, periodId: r.periodId, offeringId: r.offeringId,
    held: true, heldAt: r.startsAt, topic: `Учебное занятие: ${r.title}` }));
}
export function fixtureAttendance(externalStudentId: string, actual: ActualClass[]): Attendance[] {
  return actual.filter(r => stableNumber(r.sessionId) % 3 !== 0).map(r => ({ ref: ref("ATTENDANCE", `${externalStudentId}:${r.sessionId}`), attendanceId: `${externalStudentId}:${r.sessionId}`,
    sessionId: r.sessionId, externalStudentId, periodId: r.periodId, offeringId: r.offeringId,
    status: stableNumber(r.sessionId) % 5 === 0 ? "ABSENT" : "PRESENT", statusLabel: stableNumber(r.sessionId) % 5 === 0 ? "Отсутствовал(а)" : "Присутствовал(а)", recordedAt: r.heldAt }));
}
