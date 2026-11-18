import "server-only";
import type { AcademicPeriod, ActualClass, Attendance as SourceAttendance, ChangeRead, ScheduleRecord, ScheduleRead } from "@/server/integrations/contracts";
import type { SchedulePort, SourceRange } from "@/server/integrations/academic-port";
import { StudentAcademicContext, audienceAllowed } from "@/modules/student-context/scope";
import type { AcademicPeriod as PublicPeriod, OfferingSummary, PeriodListResponse, ScheduleEntry, ScheduleDetail, ScheduleListResponse, ResponseMeta, PartialError, SessionPage } from "@/shared/contracts/student-api";
import { AppError } from "@/shared/server/errors";
import { pageSlice } from "@/shared/server/references";
import { notFound } from "@/shared/server/route";
import { localDay } from "@/shared/lib/dates";
import type { ExternalRef } from "@/server/integrations/contracts";

type BoundRecord = { raw: ScheduleRecord; entry: ScheduleEntry; period: AcademicPeriod };
type Snapshot = { records: BoundRecord[]; complete: boolean; errors: PartialError[] };
export class ScheduleService {
  constructor(readonly context: StudentAcademicContext, private port: SchedulePort) {}
  private meta(complete: boolean, errors: PartialError[] = []): ResponseMeta {
    return { requestId: this.context.auth.requestId, sourceStatus: complete ? "READY" : "PARTIAL", completeness: complete, fetchedAt: new Date().toISOString(),
      completenessByDataset: { context: !this.context.partial, schedule: complete }, partialErrors: errors.slice(0, 30) };
  }
  periods(): PeriodListResponse {
    const items: PublicPeriod[] = this.context.record.periods.map(p => ({ periodId: this.context.periodId(p), label: p.label,
      isCurrent: p.periodId === this.context.currentPeriod()?.periodId, ...(p.startsOn ? { startsOn: p.startsOn } : {}), ...(p.endsOn ? { endsOn: p.endsOn } : {}) }));
    return { data: { items, nextCursor: null, isComplete: this.context.isComplete, dataState: items.length ? "READY" : this.context.isComplete ? "EMPTY_CONFIRMED" : "UNKNOWN" }, meta: this.meta(this.context.isComplete) };
  }
  async summary(period: AcademicPeriod, offeringId: string, on = this.context.today): Promise<OfferingSummary> {
    const offering = (await this.context.getOfferings(period)).find(o => o.offeringId === offeringId);
    if (!offering) throw notFound();
    // В архивном семестре показывается назначение на последний день периода.
    const date = period.endsOn && on > period.endsOn ? period.endsOn : period.startsOn && on < period.startsOn ? period.startsOn : on;
    const scope = await this.context.resolve(period, date), assignment = scope.officialAssignments.find(a => a.offeringId === offeringId);
    const id = this.context.offeringId(period.periodId, offeringId);
    return { kind: "OFFERING", offeringId: id, periodId: this.context.periodId(period), title: offering.title,
      ...(offering.teacherLabel ? { teacherLabel: offering.teacherLabel } : {}),
      subgroup: assignment ? { dataState: "READY", subgroupId: this.context.id("subgroup", period.periodId, offeringId, assignment.subgroupId), label: assignment.subgroupLabel, appliesToOfferingId: id } : { dataState: "UNKNOWN" },
      target: { kind: "OFFERING", targetRef: id } };
  }
  async offerings(publicPeriod: string, limit: number, cursor?: string, search?: string) {
    const period = this.context.period(publicPeriod), offerings = await this.context.getOfferings(period);
    const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ru-RU");
    const items = await Promise.all(offerings.filter(o => !search || normalize(o.title).includes(normalize(search))).map(o => this.summary(period, o.offeringId)));
    items.sort((a, b) => a.title.localeCompare(b.title, "ru-RU") || a.offeringId.localeCompare(b.offeringId));
    const complete = !this.context.partial && items.every(o => o.subgroup.dataState === "READY");
    return { data: { ...pageSlice(items, this.context.auth.accountId, ["offerings", publicPeriod, search ?? "", limit], this.context.revision, limit, cursor),
      isComplete: complete, dataState: items.length ? "READY" as const : complete ? "EMPTY_CONFIRMED" as const : "UNKNOWN" as const }, meta: this.meta(complete, complete ? [] : [{ dataset: "CONTEXT", code: "SCOPE_CONFLICT" }]) };
  }
  private async bind(period: AcademicPeriod, raw: ScheduleRecord, changes: ChangeRead | null, range: SourceRange): Promise<BoundRecord | null> {
    const context = this.context;
    if (raw.ref.sourceCode !== context.identity.sourceCode || raw.periodId !== period.periodId || !raw.startsAt || !raw.timeZone) return null;
    let day: string;
    try { day = localDay(raw.startsAt, raw.timeZone); } catch { return null; }
    if (day < range.from || day > range.to || raw.endsAt && Date.parse(raw.endsAt) <= Date.parse(raw.startsAt)) return null;
    const scope = await context.resolve(period, day);
    if (!scope.offeringIds.includes(raw.offeringId)) return null;
    const assignment = scope.officialAssignments.find(a => a.offeringId === raw.offeringId);
    if (raw.subgroupId && raw.subgroupId !== assignment?.subgroupId) return null;
    if (!raw.audiences.some(a => audienceAllowed(scope, a, raw.offeringId))) return null;
    const subgroup = raw.subgroupId || raw.audiences.find(a => a.scopeType === "SUBGROUP" && audienceAllowed(scope, a, raw.offeringId))?.scopeId;
    const matchingChanges = changes?.items.filter(c => c.ref.sourceCode === context.identity.sourceCode && c.sourceRevision === context.revision && c.scheduleEntryId === raw.scheduleEntryId && c.occurrenceId === raw.occurrenceId) ?? [];
    matchingChanges.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "") || b.changeId.localeCompare(a.changeId));
    const change = matchingChanges[0];
    const scheduleId = context.id("schedule", period.periodId, raw.offeringId, raw.scheduleEntryId, raw.occurrenceId);
    const entry: ScheduleEntry = { scheduleId, periodId: context.periodId(period), offeringId: context.offeringId(period.periodId, raw.offeringId), title: raw.title, status: raw.state,
      target: { kind: "SCHEDULE", targetRef: scheduleId }, ...(raw.lessonType ? { lessonType: raw.lessonType } : {}), plannedStart: raw.startsAt,
      ...(raw.endsAt ? { plannedEnd: raw.endsAt } : {}), timeZone: raw.timeZone, ...(raw.room ? { room: raw.room } : {}), ...(raw.teacherLabel ? { teacherLabel: raw.teacherLabel } : {}),
      ...(subgroup && assignment ? { subgroupLabel: assignment.subgroupLabel } : {}),
      ...(change ? { change: { changeKey: context.id("schedule-change", change.changeId), changeKind: change.changeKind, ...(change.description ? { description: change.description } : {}),
        ...(change.occurredAt ? { occurredAt: change.occurredAt } : {}), revision: context.id("revision", change.sourceRevision) } } : {}) };
    return { raw, entry, period };
  }
  private async snapshot(range: SourceRange, onlyPeriod?: AcademicPeriod): Promise<Snapshot> {
    const periods = (onlyPeriod ? [onlyPeriod] : this.context.record.periods).filter(p => (!p.startsOn || p.startsOn <= range.to) && (!p.endsOn || p.endsOn >= range.from));
    const records: BoundRecord[] = [], errors: PartialError[] = [];
    let complete = !this.context.partial, available = 0;
    for (const period of periods) {
      const scope = this.context.sourcePeriod(period);
      const result = await Promise.allSettled([this.port.getSchedule(scope, range), this.port.getChanges(scope, range)]);
      let schedule: ScheduleRead | null = null, changes: ChangeRead | null = null;
      if (result[0].status === "fulfilled") { schedule = result[0].value; this.context.checkRead(schedule, period); }
      if (result[1].status === "fulfilled") { changes = result[1].value; this.context.checkRead(changes, period); }
      if (!schedule || schedule.availability === "ERROR") { complete = false; errors.push({ dataset: "SCHEDULE", code: "SOURCE_UNAVAILABLE" }); continue; }
      available++;
      if (schedule.isComplete !== true || !changes || changes.isComplete !== true || changes.availability === "ERROR") { complete = false; errors.push({ dataset: "SCHEDULE", code: "SOURCE_INCOMPLETE" }); }
      if (changes && (new Set(changes.items.map(c => c.changeId)).size !== changes.items.length || changes.items.some(c => c.ref.sourceCode !== this.context.identity.sourceCode || c.sourceRevision !== this.context.revision || !schedule!.items.some(r => r.scheduleEntryId === c.scheduleEntryId && r.occurrenceId === c.occurrenceId)))) {
        complete = false; errors.push({ dataset: "SCHEDULE", code: "SOURCE_INVALID" }); changes = null;
      }
      const seen = new Set<string>();
      for (const raw of schedule.items) {
        const item = await this.bind(period, raw, changes, range);
        if (!item || seen.has(item.entry.scheduleId)) { complete = false; continue; }
        seen.add(item.entry.scheduleId); records.push(item);
        const day = localDay(raw.startsAt!, raw.timeZone!);
        if ((await this.context.resolve(period, day)).uncertainOfferingIds.length) complete = false;
      }
      // Даже пустая выборка не доказывает отсутствие скрытых подгрупповых занятий.
      const date = period.startsOn && range.from < period.startsOn ? period.startsOn : range.from;
      if ((await this.context.resolve(period, date)).uncertainOfferingIds.length) { complete = false; errors.push({ dataset: "CONTEXT", code: "SCOPE_CONFLICT" }); }
    }
    if (periods.length && !available) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Расписание временно недоступно. Попробуйте ещё раз.");
    complete = complete && !this.context.partial;
    if (!complete && !errors.length) errors.push({ dataset: "SCHEDULE", code: "SOURCE_INVALID" });
    records.sort((a, b) => Date.parse(a.raw.startsAt!) - Date.parse(b.raw.startsAt!) || a.entry.scheduleId.localeCompare(b.entry.scheduleId));
    return { records, complete, errors };
  }
  async list(range: SourceRange, limit: number, cursor?: string): Promise<ScheduleListResponse> {
    const snapshot = await this.snapshot(range);
    return { data: { ...pageSlice(snapshot.records.map(r => r.entry), this.context.auth.accountId, ["schedule", range.from, range.to, limit], this.context.revision, limit, cursor),
      isComplete: snapshot.complete, dataState: snapshot.records.length ? "READY" : snapshot.complete ? "EMPTY_CONFIRMED" : "UNKNOWN" }, meta: this.meta(snapshot.complete, snapshot.errors) };
  }
  async relatedClasses(period:AcademicPeriod,offeringId:string,refs:ExternalRef[]){
    if(!period.startsOn||!period.endsOn)return {ids:[] as string[],complete:false};
    const snapshot=await this.snapshot({from:period.startsOn,to:period.endsOn},period);
    const matches=snapshot.records.filter(r=>r.raw.offeringId===offeringId&&refs.some(ref=>ref.sourceCode===r.raw.ref.sourceCode&&ref.objectKind===r.raw.ref.objectKind&&ref.externalId===r.raw.ref.externalId));
    return {ids:matches.map(r=>r.entry.scheduleId),complete:snapshot.complete&&matches.length===refs.length};
  }
  private async details(bound: BoundRecord) {
    const range = { from: localDay(bound.raw.startsAt!, bound.raw.timeZone!), to: localDay(bound.raw.startsAt!, bound.raw.timeZone!) };
    const scope = this.context.sourcePeriod(bound.period);
    const response = await Promise.allSettled([this.port.getActualSessions(scope, range), this.port.getAttendance(scope, range)]);
    const detail: ScheduleDetail = { schedule: bound.entry, actualState: "UNKNOWN", attendanceState: "UNKNOWN" };
    const errors: PartialError[] = [];
    let actualComplete: boolean | null = null, attendanceComplete: boolean | null = null;
    let actual: ActualClass | undefined;
    if (response[0].status === "fulfilled") {
      const read = response[0].value; this.context.checkRead(read, bound.period); actualComplete = read.isComplete;
      if (read.availability === "ERROR") detail.actualState = "SOURCE_ERROR";
      else {
        const candidates = read.items.filter(a => a.ref.sourceCode === scope.sourceCode && a.periodId === scope.periodId && a.offeringId === bound.raw.offeringId && a.scheduleEntryId === bound.raw.scheduleEntryId && a.occurrenceId === bound.raw.occurrenceId);
        if (candidates.length === 1) actual = candidates[0];
        else if (candidates.length > 1) { actualComplete = false; errors.push({ dataset: "ACTUAL", code: "SOURCE_INVALID" }); }
      }
    } else detail.actualState = "SOURCE_ERROR";
    if (actual) {
      const id = this.context.id("actual", scope.periodId, actual.offeringId, actual.sessionId);
      detail.actual = { sessionId: id, scheduleId: bound.entry.scheduleId, held: actual.held, ...(actual.heldAt ? { heldAt: actual.heldAt } : {}), ...(actual.heldOn ? { heldOn: actual.heldOn } : {}), ...(actual.topic ? { topic: actual.topic } : {}) };
      detail.actualState = "READY";
    }
    if (response[1].status === "fulfilled") {
      const read = response[1].value; this.context.checkRead(read, bound.period); attendanceComplete = read.isComplete;
      if (read.availability === "ERROR") detail.attendanceState = "SOURCE_ERROR";
      else if (actual) {
        const candidates: SourceAttendance[] = read.items.filter(a => a.ref.sourceCode === scope.sourceCode && a.externalStudentId === scope.externalStudentId && a.periodId === scope.periodId && a.offeringId === bound.raw.offeringId && a.sessionId === actual!.sessionId);
        if (candidates.length === 1) {
          const attendance = candidates[0]; detail.attendance = { attendanceId: this.context.id("attendance", attendance.attendanceId), actualSessionId: detail.actual!.sessionId,
            status: attendance.status, statusLabel: attendance.statusLabel, ...(attendance.recordedAt ? { recordedAt: attendance.recordedAt } : {}) }; detail.attendanceState = "READY";
        } else if (candidates.length > 1) { attendanceComplete = false; errors.push({ dataset: "ATTENDANCE", code: "SOURCE_INVALID" }); }
      }
    } else detail.attendanceState = "SOURCE_ERROR";
    if (actualComplete !== true) errors.push({ dataset: "ACTUAL", code: detail.actualState === "SOURCE_ERROR" ? "SOURCE_UNAVAILABLE" : "SOURCE_INCOMPLETE" });
    if (attendanceComplete !== true) errors.push({ dataset: "ATTENDANCE", code: detail.attendanceState === "SOURCE_ERROR" ? "SOURCE_UNAVAILABLE" : "SOURCE_INCOMPLETE" });
    return { detail, actualComplete, attendanceComplete, errors };
  }
  async detail(publicId: string) {
    // Ссылка не расшифровывается в чужой ID: сравнение только с заново разрешённой выборкой.
    for (const period of this.context.record.periods) {
      if (!period.startsOn || !period.endsOn) continue;
      const snapshot = await this.snapshot({ from: period.startsOn, to: period.endsOn }, period);
      const bound = snapshot.records.find(r => r.entry.scheduleId === publicId);
      if (!bound) continue;
      const actual = await this.details(bound), complete = snapshot.complete && actual.actualComplete === true && actual.attendanceComplete === true;
      return { data: actual.detail, meta: { ...this.meta(complete, [...snapshot.errors, ...actual.errors]), completenessByDataset: { context: !this.context.partial, schedule: snapshot.complete, actual: actual.actualComplete, attendance: actual.attendanceComplete } } };
    }
    throw notFound();
  }
  async sessions(publicPeriod: string, publicOffering: string, range: SourceRange, limit: number, cursor?: string) {
    const period = this.context.period(publicPeriod), offering = await this.context.offering(period, publicOffering);
    const snapshot = await this.snapshot(range, period), records = snapshot.records.filter(r => r.raw.offeringId === offering.offeringId);
    const page = pageSlice(records, this.context.auth.accountId, ["sessions", publicPeriod, publicOffering, range.from, range.to, limit], this.context.revision, limit, cursor);
    const details = await Promise.all(page.items.map(r => this.details(r)));
    const complete = snapshot.complete && details.every(d => d.actualComplete === true && d.attendanceComplete === true);
    const data: SessionPage = { items: details.map(d => d.detail), nextCursor: page.nextCursor, isComplete: complete, dataState: records.length ? "READY" : complete ? "EMPTY_CONFIRMED" : "UNKNOWN" };
    const actualComplete = details.every(d => d.actualComplete === true) ? true : details.some(d => d.actualComplete === false) ? false : null;
    const attendanceComplete = details.every(d => d.attendanceComplete === true) ? true : details.some(d => d.attendanceComplete === false) ? false : null;
    return { data, meta: { ...this.meta(complete, [...snapshot.errors, ...details.flatMap(d => d.errors)]), completenessByDataset: { context: !this.context.partial, schedule: snapshot.complete, actual: actualComplete, attendance: attendanceComplete } } };
  }
}
