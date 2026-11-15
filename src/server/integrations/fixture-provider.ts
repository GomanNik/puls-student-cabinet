import "server-only";
import { z } from "zod";
import { ActualReadSchema, AssignmentReadSchema, AttendanceReadSchema, ChangeReadSchema, ContextReadSchema, OfferingReadSchema, ScheduleReadSchema } from "./contracts";
import type { AcademicContextPort, SchedulePort, SourceIdentity, SourcePeriod, SourceRange } from "./academic-port";
import { FIXTURE_REVISION, SOURCE, fixtureActual, fixtureAssignments, fixtureAttendance, fixtureChanges, fixtureSchedule, studentFixture } from "./academic-fixtures";
import { AppError } from "@/shared/server/errors";
import { DeadlineReadSchema, type Deadline } from "./contracts";
import { addDays, localDay } from "@/shared/lib/dates";
import type { LearningPort, SourceLearningScope } from "./learning-port";
import { fixtureLearning, fixtureUnits } from "./learning-fixtures";
import { UnitReadSchema, WorkReadSchema, ProgressReadSchema, StageReadSchema, StageProgressReadSchema, WorkResultReadSchema, GradingModelReadSchema, AssessmentReadSchema, AttestationReadSchema, CourseResultReadSchema, MaterialReadSchema } from "./contracts";

const standardScenarios = ["normal", "missing-assignment", "conflicting-assignment", "schedule-error", "changes-error", "partial-attendance", "invalid-scope", "revision-change", "works-error", "partial-works", "materials-error", "deadline-before", "deadline-moved"] as const;
const datasets=["context","offerings","assignments","schedule","changes","actual","attendance","units","works","progress","stages","results","grading","assessment","attestation","course-result","materials","deadlines"] as const;
export const fixtureScenarios=[...standardScenarios,...datasets.flatMap(d=>["partial","no-data","not-applicable","error","timeout"].map(state=>`${d}-${state}`)),"materials-invalid-link"];
export type FixtureScenario = typeof fixtureScenarios[number];

// Один экземпляр на запрос: режим и revision не меняются между его срезами.
export class FixtureAcademicProvider implements AcademicContextPort, SchedulePort, LearningPort {
  readonly timeZone = "Asia/Omsk";
  readonly revision: string;
  private readonly fixtureDay=localDay(new Date(),this.timeZone);
  constructor(readonly scenario: FixtureScenario = "normal") {
    this.revision = `${FIXTURE_REVISION}:${scenario}:${this.fixtureDay}${scenario === "revision-change" ? `:${Math.floor(Date.now() / 60_000)}` : ""}`;
  }
  private read<T>(schema: z.ZodType<T>, scope: SourceIdentity & { periodId?: string; offeringId?: string; unitId?: string }, items: unknown[], dataset: string): T {
    if (scope.sourceCode !== SOURCE) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Учебный источник недоступен.");
    if(this.scenario===`${dataset}-timeout`)throw new AppError(504,"EXTERNAL_TIMEOUT","Тестовый учебный источник не ответил вовремя.");
    const noData=this.scenario===`${dataset}-no-data`,notApplicable=this.scenario===`${dataset}-not-applicable`;
    const failed = this.scenario===`${dataset}-error` || this.scenario === "schedule-error" && dataset === "schedule" || this.scenario === "changes-error" && dataset === "changes" || this.scenario === "works-error" && dataset === "works" || this.scenario === "materials-error" && dataset === "materials";
    const partial = this.scenario===`${dataset}-partial` || this.scenario === "partial-attendance" && dataset === "attendance" || this.scenario === "partial-works" && dataset === "works";
    const requestedScope = { externalStudentId: scope.externalStudentId, ...(scope.periodId ? { periodId: scope.periodId } : {}), ...(scope.offeringId ? { offeringId: scope.offeringId } : {}), ...(scope.unitId ? { unitId: scope.unitId } : {}) };
    const result = schema.safeParse({ sourceCode: SOURCE, requestedScope, items: failed || noData || notApplicable ? [] : partial ? items.slice(0, 1) : items,
      availability: failed ? "ERROR" : partial ? "PARTIAL" : notApplicable ? "NOT_APPLICABLE" : noData ? "NO_DATA" : items.length ? "OK" : dataset === "grading" ? "NOT_APPLICABLE" : "NO_DATA", isComplete: !failed && !partial,
      fetchedAt: new Date().toISOString(), sourceUpdatedAt: "2026-11-13T00:00:00Z", sourceRevision: this.revision,
      ...(failed ? { safeErrorCode: "SOURCE_UNAVAILABLE" } : {}) });
    if (!result.success) throw new AppError(502, "EXTERNAL_INVALID_RESPONSE", "Не удалось прочитать учебные сведения.");
    return result.data;
  }
  async getContext(scope: SourceIdentity) {
    const student = studentFixture(scope.externalStudentId);
    return this.read(ContextReadSchema, scope, student ? [student.context] : [], "context");
  }
  async getOfferings(scope: SourcePeriod) {
    return this.read(OfferingReadSchema, scope, studentFixture(scope.externalStudentId)?.offerings.filter(o => o.periodId === scope.periodId) ?? [], "offerings");
  }
  async getAssignments(scope: SourcePeriod, on: string) {
    let items = fixtureAssignments(scope.externalStudentId, scope.periodId, on);
    if (this.scenario === "missing-assignment") items = items.filter(a => !a.offeringId.endsWith("english"));
    if (this.scenario === "conflicting-assignment") {
      const assignment = items.find(a => a.offeringId.endsWith("english"));
      if (assignment) items.push({ ...assignment, ref: { ...assignment.ref, externalId: `${assignment.ref.externalId}:conflict` }, subgroupId: `${assignment.offeringId}-subgroup-2`, subgroupLabel: "Подгруппа 2" });
    }
    const period = studentFixture(scope.externalStudentId)?.context.periods.find(p => p.periodId === scope.periodId);
    if (!period || period.startsOn && on < period.startsOn || period.endsOn && on > period.endsOn) items = [];
    return this.read(AssignmentReadSchema, scope, items, "assignments");
  }
  private records(scope: SourcePeriod, range: SourceRange) {
    const records = fixtureSchedule(scope.externalStudentId, scope.periodId, range.from, range.to).filter(r => !r.subgroupId ||
      fixtureAssignments(scope.externalStudentId, scope.periodId, r.startsAt ? localDay(r.startsAt, r.timeZone!) : undefined).some(a => a.offeringId === r.offeringId && a.subgroupId === r.subgroupId));
    if (this.scenario === "invalid-scope" && records[0]) records.push({ ...records[0], ref: { ...records[0].ref, externalId: "invalid-foreign-record" }, offeringId: "foreign-offering" });
    return records;
  }
  async getSchedule(scope: SourcePeriod, range: SourceRange) { return this.read(ScheduleReadSchema, scope, this.records(scope, range), "schedule"); }
  async getChanges(scope: SourcePeriod, range: SourceRange) { return this.read(ChangeReadSchema, scope, fixtureChanges(this.records(scope, range)).map(change => ({ ...change, sourceRevision: this.revision })), "changes"); }
  async getActualSessions(scope: SourcePeriod, range: SourceRange) { return this.read(ActualReadSchema, scope, fixtureActual(this.records(scope, range)), "actual"); }
  async getAttendance(scope: SourcePeriod, range: SourceRange) { return this.read(AttendanceReadSchema, scope, fixtureAttendance(scope.externalStudentId, fixtureActual(this.records(scope, range))), "attendance"); }
  async getUnits(scope: SourcePeriod) { return this.read(UnitReadSchema, scope, fixtureUnits(scope), "units"); }
  async getWorks(scope: SourceLearningScope) {
    const works=fixtureLearning(scope).works;
    if(["deadline-before","deadline-moved"].includes(this.scenario)&&scope.periodId==="fall-2026"&&scope.offeringId?.endsWith("math")){const work=works[0];if(work)work.due={precision:"DATE_ONLY",on:addDays(this.fixtureDay,this.scenario==="deadline-before"?2:5)};}
    return this.read(WorkReadSchema, scope, works, "works");
  }
  async getProgress(scope: SourceLearningScope) { return this.read(ProgressReadSchema, scope, fixtureLearning(scope).progress, "progress"); }
  async getStages(scope: SourceLearningScope, workId: string) { return this.read(StageReadSchema, scope, fixtureLearning(scope).stages.filter(s => s.workId === workId), "stages"); }
  async getStageProgress(scope: SourceLearningScope, workId: string) {
    const data = fixtureLearning(scope), ids = new Set(data.stages.filter(s => s.workId === workId).map(s => s.stageId));
    return this.read(StageProgressReadSchema, scope, data.stageProgress.filter(p => ids.has(p.stageId)), "stages");
  }
  async getWorkResults(scope: SourceLearningScope, workId: string) { return this.read(WorkResultReadSchema, scope, fixtureLearning(scope).workResults.filter(r => r.workId === workId), "results"); }
  async getGradingModel(scope: SourceLearningScope) { return this.read(GradingModelReadSchema, scope, fixtureLearning(scope).grading, "grading"); }
  async getAssessments(scope: SourceLearningScope) { return this.read(AssessmentReadSchema, scope, fixtureLearning(scope).assessments, "assessment"); }
  async getAttestations(scope: SourceLearningScope) { return this.read(AttestationReadSchema, scope, fixtureLearning(scope).attestations, "attestation"); }
  async getCourseResults(scope: SourceLearningScope) { return this.read(CourseResultReadSchema, scope, fixtureLearning(scope).courseResults, "course-result"); }
  async getMaterials(scope: SourceLearningScope) {
    const items=fixtureLearning(scope).materials.filter(m=>m.audiences.some(a=>a.scopeType==="STUDENT"&&a.scopeId===scope.externalStudentId));
    if(this.scenario==="materials-invalid-link"){const link=items.find(m=>m.kind==="LINK");if(link)link.publicHttpsUrl="http://127.0.0.1/private";}
    return this.read(MaterialReadSchema,scope,items,"materials");
  }
  async getDeadlines(scope:SourceLearningScope){
    // readAcademicDeadlines — проекция тех же исходных дат, без второй копии.
    const works=await this.getWorks(scope),items:Deadline[]=[];
    let complete=works.isComplete===true&&works.availability!=="ERROR";
    const add=(id:string,title:string,due:Deadline["due"],link:Pick<Deadline,"relatedWorkRef"|"relatedAttestationRef">,audiences:Deadline["audiences"])=>items.push({ref:{sourceCode:scope.sourceCode,objectKind:"ACADEMIC_DEADLINE",externalId:id},deadlineId:id,title,due,...link,audiences});
    for(const work of works.items){
      if(work.due)add(work.workId,work.title,work.due,{relatedWorkRef:work.ref},work.audiences);
      const stages=await this.getStages(scope,work.workId);complete&&=stages.isComplete===true&&stages.availability!=="ERROR";
      for(const stage of stages.items)if(stage.due)add(stage.stageId,`${work.title}: ${stage.title}`,stage.due,{relatedWorkRef:work.ref},work.audiences);
    }
    if(scope.offeringId){const attestations=await this.getAttestations(scope);complete&&=attestations.isComplete===true&&attestations.availability!=="ERROR";for(const a of attestations.items)if(a.planned)add(a.attestationId,a.kindLabel,a.planned,{relatedAttestationRef:a.ref},[{scopeType:"STUDENT",scopeId:scope.externalStudentId}]);}
    const result=this.read(DeadlineReadSchema,scope,items,"deadlines");
    return DeadlineReadSchema.parse(complete?result:{...result,isComplete:false,availability:result.availability==="ERROR"?"ERROR":"PARTIAL"});
  }
  today() { return this.fixtureDay; }
}
export function fixtureProvider() {
  const value = process.env.PULS_FIXTURE_SCENARIO ?? "normal";
  if (!(fixtureScenarios as readonly string[]).includes(value)) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Некорректная конфигурация учебного источника.");
  return new FixtureAcademicProvider(value as FixtureScenario);
}
