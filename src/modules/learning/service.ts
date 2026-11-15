import "server-only";
import type { AcademicPeriod, AcademicUnit, AcademicWork, ExternalRef, WorkProgress as SourceProgress, Material as SourceMaterial, SourceAvailability, RequestedScope, AssessmentValue as SourceValue } from "@/server/integrations/contracts";
import type { LearningPort, SourceLearningScope } from "@/server/integrations/learning-port";
import { StudentAcademicContext, audienceAllowed } from "@/modules/student-context/scope";
import type { AcademicDate, AssessmentValue, DataState, IndependentUnitSummary, ListStatus, Material, OfferingDetail, PartialError, ResponseMeta, ResultsView, Stage, TimelineEntry, WorkDetail, WorkProgress, WorkSummary } from "@/shared/contracts/student-api";
import { pageSlice } from "@/shared/server/references";
import { notFound } from "@/shared/server/route";
import { AppError } from "@/shared/server/errors";
import { ScheduleService } from "@/modules/schedule/service";
import { localDay } from "@/shared/lib/dates";
import type { AcademicSearchResult, Target } from "@/shared/contracts/student-api";

import { securityAudit } from "@/shared/server/security-audit";

type Read<T> = { sourceCode: string; requestedScope: RequestedScope; availability: SourceAvailability; isComplete: boolean | null; items: T[]; sourceRevision?: string };
type Slice<T> = { items: T[]; state: DataState; complete: boolean | null; errors: PartialError[]; dataset?: PartialError["dataset"] };
export type LearningBinding = { period: AcademicPeriod; source: SourceLearningScope; publicPeriod: string; publicContext: string; title: string; kind: "OFFERING" | "INDEPENDENT_UNIT" };
export type WorkSelection = { filter: "ALL" | "DUE" | "RESULT"; sort: "DUE" | "ISSUED" | "TITLE"; query: string };
const listStatus = <T>(slice: Slice<T>): ListStatus => ({ dataState: slice.state, isComplete: slice.complete, nextCursor: null });
const unknownProgress = (): WorkProgress => ({ dataState: "UNKNOWN" });
export class LearningService {
  private sourceFailureLogged=false;
  private async sourceFailure(){if(!this.sourceFailureLogged){this.sourceFailureLogged=true;await securityAudit("SOURCE_ERROR",{requestId:this.context.auth.requestId,accountId:this.context.auth.accountId,target:"SOURCE"});}}
  constructor(readonly context: StudentAcademicContext, private port: LearningPort, readonly schedule: ScheduleService) {}
  meta(slices: Slice<unknown>[] = [], dataset?: "work" | "material"): ResponseMeta {
    const complete = !this.context.partial && slices.every(s => s.complete === true);
    const completenessByDataset: NonNullable<ResponseMeta["completenessByDataset"]> = { context: !this.context.partial };
    const keys: Partial<Record<PartialError["dataset"], keyof typeof completenessByDataset>> = { CONTEXT: "context", SCHEDULE: "schedule", ACTUAL: "actual", ATTENDANCE: "attendance", WORK: "work", STAGE: "stage", ASSESSMENT: "assessment", ATTESTATION: "attestation", MATERIAL: "material" };
    for (const slice of slices) {
      const key = slice.dataset ? keys[slice.dataset] : undefined; if (!key) continue;
      const previous = completenessByDataset[key];
      completenessByDataset[key] = previous === undefined ? slice.complete : previous === false || slice.complete === false ? false : previous === null || slice.complete === null ? null : true;
    }
    if (dataset && completenessByDataset[dataset] === undefined) completenessByDataset[dataset] = complete;
    return { requestId: this.context.auth.requestId, sourceStatus: complete ? "READY" : "PARTIAL", completeness: complete, completenessByDataset, fetchedAt: new Date().toISOString(), partialErrors: slices.flatMap(s => s.errors).slice(0, 30) };
  }
  private id(binding: LearningBinding, kind: string, id: string) { return this.context.id(kind, binding.period.periodId, binding.source.offeringId ?? binding.source.unitId!, id); }
  private async read<T extends { ref: ExternalRef }>(binding: LearningBinding, operation: () => Promise<Read<T>>, dataset: PartialError["dataset"], accepts: (item: T) => boolean): Promise<Slice<T>> {
    try {
      const read = await operation(); this.context.checkRead(read, binding.period);
      if (read.requestedScope.offeringId !== binding.source.offeringId || read.requestedScope.unitId !== binding.source.unitId) throw new AppError(502, "EXTERNAL_INVALID_RESPONSE", "Область учебного источника не совпала.");
      if (read.availability === "ERROR") { await this.sourceFailure();return { dataset, items: [], state: "SOURCE_ERROR", complete: false, errors: [{ dataset, code: "SOURCE_UNAVAILABLE" }] };}
      const items = read.items.filter(item => item.ref.sourceCode === this.context.identity.sourceCode && accepts(item));
      const unique = items.filter(item => items.filter(other => other.ref.externalId === item.ref.externalId && other.ref.objectKind === item.ref.objectKind).length === 1);
      const complete = unique.length === read.items.length ? read.isComplete : false;
      return { dataset, items: unique, state: items.length ? "READY" : read.availability === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : complete === true ? "EMPTY_CONFIRMED" : "UNKNOWN", complete,
        errors: complete === true ? [] : [{ dataset, code: unique.length === read.items.length ? "SOURCE_INCOMPLETE" : "SOURCE_INVALID" }] };
    } catch (error) {
      if (error instanceof AppError && (error.code === "SOURCE_REVISION_CHANGED" || error.status === 404 || error.status === 401)) throw error;
      await this.sourceFailure();
      return { dataset, items: [], state: "SOURCE_ERROR", complete: false, errors: [{ dataset, code: "SOURCE_UNAVAILABLE" }] };
    }
  }
  private date(period: AcademicPeriod) { return period.endsOn && this.context.today > period.endsOn ? period.endsOn : period.startsOn && this.context.today < period.startsOn ? period.startsOn : this.context.today; }
  async units(publicPeriod: string) {
    const period = this.context.period(publicPeriod), response = await this.port.getUnits(this.context.sourcePeriod(period));
    this.context.checkRead(response, period);
    if (response.availability === "ERROR") throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Самостоятельные учебные единицы недоступны.");
    const scope = await this.context.resolve(period, this.date(period));
    const items = response.items.filter(u => u.ref.sourceCode === scope.sourceCode && u.periodId === period.periodId && u.audiences.some(a => audienceAllowed(scope, a)));
    const complete=response.isComplete===true&&items.length===response.items.length;
    if(!complete)this.context.markIncomplete();
    return { period, items, complete };
  }
  unitSummary(period: AcademicPeriod, unit: AcademicUnit): IndependentUnitSummary {
    const id = this.context.id("unit", period.periodId, unit.unitId);
    return { kind: "INDEPENDENT_UNIT", unitId: id, periodId: this.context.periodId(period), title: unit.title, unitTypeLabel: unit.unitTypeLabel, target: { kind: "UNIT", targetRef: id } };
  }
  async bind(publicPeriod: string, publicContext: string, kind: LearningBinding["kind"]): Promise<LearningBinding> {
    const period = this.context.period(publicPeriod);
    if (kind === "OFFERING") {
      const offering = await this.context.offering(period, publicContext);
      return { period, publicPeriod, publicContext, kind, title: offering.title, source: { ...this.context.sourcePeriod(period), offeringId: offering.offeringId } };
    }
    const unit = (await this.units(publicPeriod)).items.find(u => this.context.id("unit", period.periodId, u.unitId) === publicContext);
    if (!unit) throw notFound();
    return { period, publicPeriod, publicContext, kind, title: unit.title, source: { ...this.context.sourcePeriod(period), unitId: unit.unitId } };
  }
  async works(binding: LearningBinding) {
    const scope = await this.context.resolve(binding.period, this.date(binding.period));
    return this.read(binding, () => this.port.getWorks(binding.source), "WORK", w => w.periodId === binding.period.periodId && w.offeringId === binding.source.offeringId && w.unitId === binding.source.unitId && w.audiences.some(a => audienceAllowed(scope, a, binding.source.offeringId)));
  }
  private progress(raw?: SourceProgress): WorkProgress {
    if (!raw) return unknownProgress();
    return { dataState: "READY", ...(raw.assignmentStatusCode ? { assignmentStatusCode: raw.assignmentStatusCode } : {}), ...(raw.completionStatusCode ? { completionStatusCode: raw.completionStatusCode } : {}),
      ...(raw.submissionStatusCode ? { submissionStatusCode: raw.submissionStatusCode } : {}), ...(raw.reviewStatusCode ? { reviewStatusCode: raw.reviewStatusCode } : {}),
      ...(raw.completedAt ? { completedAt: raw.completedAt } : {}), ...(raw.submittedAt ? { submittedAt: raw.submittedAt } : {}), ...(raw.reviewedAt ? { reviewedAt: raw.reviewedAt } : {}) };
  }
  async progressSlice(binding: LearningBinding, works: AcademicWork[]) {
    const slice = await this.read(binding, () => this.port.getProgress(binding.source), "WORK", p => p.externalStudentId === this.context.identity.externalStudentId && works.some(w => w.workId === p.workId));
    const items = slice.items.filter(item => slice.items.filter(p => p.workId === item.workId).length === 1);
    if (items.length !== slice.items.length) { slice.complete = false; slice.errors.push({ dataset: "WORK", code: "SOURCE_INVALID" }); }
    return { ...slice, items };
  }
  workSummary(binding: LearningBinding, raw: AcademicWork, progress?: SourceProgress, progressState?: DataState): WorkSummary {
    const id = this.id(binding, "work", raw.workId);
    return { workId: id, periodId: binding.publicPeriod, ...(binding.kind === "OFFERING" ? { offeringId: binding.publicContext } : { unitId: binding.publicContext }), title: raw.title,
      workTypeLabel: raw.workTypeLabel, ...(raw.issued ? { issued: raw.issued } : {}), ...(raw.due ? { due: raw.due } : {}), progress: progress ? this.progress(progress) : progressState === "SOURCE_ERROR" ? { dataState: "SOURCE_ERROR" } : unknownProgress(), target: { kind: "WORK", targetRef: id } };
  }
  async listWorks(binding: LearningBinding, limit: number, cursor?: string, selection?: WorkSelection) {
    const slice = await this.works(binding);
    if (slice.state === "SOURCE_ERROR") throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Источник работ временно недоступен.");
    const progress = await this.progressSlice(binding, slice.items);
    const results: Slice<unknown>[] = [], resultIds = new Set<string>();
    if (selection?.filter === "RESULT") for (const work of slice.items) {
      const read = await this.read(binding, () => this.port.getWorkResults(binding.source, work.workId), "ASSESSMENT", r => r.workId === work.workId && r.externalStudentId === this.context.identity.externalStudentId);
      results.push(read); if (read.items.length) resultIds.add(work.workId);
    }
    const normalized = selection?.query.normalize("NFKC").toLocaleLowerCase("ru-RU").trim();
    const items = slice.items.filter(w => (!normalized || w.title.normalize("NFKC").toLocaleLowerCase("ru-RU").includes(normalized)) && (selection?.filter !== "DUE" || !!w.due) && (selection?.filter !== "RESULT" || resultIds.has(w.workId)))
      .map(w => this.workSummary(binding, w, progress.items.find(p => p.workId === w.workId), progress.state));
    const dateKey = (date?: AcademicDate) => date?.on ?? (date?.at && date.timeZone ? localDay(date.at, date.timeZone) : undefined);
    items.sort((a, b) => {
      if (selection?.sort === "TITLE") return a.title.localeCompare(b.title, "ru-RU") || a.workId.localeCompare(b.workId);
      const issued = selection?.sort === "ISSUED", first = dateKey(issued ? a.issued : a.due), second = dateKey(issued ? b.issued : b.due);
      return (!first && second ? 1 : first && !second ? -1 : first && second ? (issued ? second.localeCompare(first) : first.localeCompare(second)) : 0) || a.workId.localeCompare(b.workId);
    });
    const meta = this.meta([slice, progress, ...results]);
    return { data: { ...pageSlice(items, this.context.auth.accountId, selection ? ["works-selection", binding.publicPeriod, binding.publicContext, selection.filter, selection.sort, normalized, limit] : ["works", binding.publicPeriod, binding.publicContext, limit], this.context.revision, limit, cursor), isComplete: meta.completeness ?? null, dataState: items.length ? "READY" as const : meta.completeness ? "EMPTY_CONFIRMED" as const : "UNKNOWN" as const }, meta };
  }
  private value(raw: SourceValue): AssessmentValue { return { kind: raw.kind, ...(raw.numeric != null ? { numeric: raw.numeric } : {}), ...(raw.text != null ? { text: raw.text } : {}), ...(raw.code != null ? { code: raw.code } : {}), ...(raw.rawValueText != null ? { rawValueText: raw.rawValueText } : {}) }; }
  async materials(binding: LearningBinding, works?: AcademicWork[]) {
    const scope = await this.context.resolve(binding.period, this.date(binding.period));
    const slice = await this.read(binding, () => this.port.getMaterials(binding.source), "MATERIAL", m => m.offeringId === binding.source.offeringId && m.unitId === binding.source.unitId && m.audiences.some(a => audienceAllowed(scope, a, binding.source.offeringId)));
    const allowedWorks = works ?? (await this.works(binding)).items;
    const items: Material[] = [];
    for (const m of slice.items) {
      const id = this.id(binding, "material", m.materialId);
      let safeExternalUrl: string | undefined;
      if (m.kind === "LINK") {
        try { const url = new URL(m.publicHttpsUrl!); if (url.protocol === "https:" && !url.username && !url.password && url.hostname === "example.org") safeExternalUrl = url.toString(); } catch { /* Некорректная ссылка не выдаётся. */ }
        if (!safeExternalUrl) { slice.complete = false; slice.errors.push({ dataset: "MATERIAL", code: "SOURCE_INVALID" }); continue; }
      } else if (!m.resourceHandle) { slice.complete = false; continue; }
      let relatedScheduleIds:string[]=[];
      if(m.relatedClassRefs?.length){
        try{if(!binding.source.offeringId)throw Error("Нет дисциплины для связи с занятием");const linked=await this.schedule.relatedClasses(binding.period,binding.source.offeringId,m.relatedClassRefs);relatedScheduleIds=linked.ids;slice.complete=slice.complete===true&&linked.complete;}
        catch(error){if(error instanceof AppError&&error.code==="SOURCE_REVISION_CHANGED")throw error;slice.complete=false;}
        if(!slice.complete)slice.errors.push({dataset:"MATERIAL",code:"SOURCE_INCOMPLETE"});
      }
      items.push({ materialId: id, title: m.title, kind: m.kind, ...(m.mimeType ? { mimeType: m.mimeType } : {}), ...(m.sizeBytes != null ? { sizeBytes: m.sizeBytes } : {}),
        ...(binding.kind === "OFFERING" ? { offeringId: binding.publicContext } : { unitId: binding.publicContext }), relatedWorkIds: allowedWorks.filter(w => m.relatedWorkRefs?.some(r => r.sourceCode === w.ref.sourceCode && r.objectKind === w.ref.objectKind && r.externalId === w.ref.externalId)).map(w => this.id(binding, "work", w.workId)),
        ...(relatedScheduleIds.length?{relatedScheduleIds}:{}),...(safeExternalUrl ? { safeExternalUrl } : { downloadTarget: { kind: "MATERIAL", targetRef: id } }) });
    }
    return { slice, items };
  }
  async workDetail(binding: LearningBinding, publicWork: string, stageRef?: string): Promise<{ data: WorkDetail; meta: ResponseMeta }> {
    const works = await this.works(binding);
    if (works.state === "SOURCE_ERROR") throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Источник работ недоступен.");
    const work = works.items.find(w => this.id(binding, "work", w.workId) === publicWork);
    if (!work) { if (works.complete !== true) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Источник работ неполон. Попробуйте ещё раз."); throw notFound(); }
    const [progress, stages, stageProgress, results, materials] = await Promise.all([
      this.progressSlice(binding, works.items),
      this.read(binding, () => this.port.getStages(binding.source, work.workId), "STAGE", s => s.workId === work.workId),
      this.read(binding, () => this.port.getStageProgress(binding.source, work.workId), "STAGE", p => p.externalStudentId === this.context.identity.externalStudentId),
      this.read(binding, () => this.port.getWorkResults(binding.source, work.workId), "ASSESSMENT", r => r.workId === work.workId && r.externalStudentId === this.context.identity.externalStudentId), this.materials(binding, works.items),
    ]);
    const sourceProgress = progress.items.find(p => p.workId === work.workId), status = sourceProgress ? this.progress(sourceProgress) : progress.state === "SOURCE_ERROR" ? { dataState: "SOURCE_ERROR" as const } : unknownProgress();
    const boundStageProgress = stageProgress.items.filter(p => stages.items.some(s => s.stageId === p.stageId) && stageProgress.items.filter(other => other.stageId === p.stageId).length === 1);
    if (boundStageProgress.length !== stageProgress.items.length) { stageProgress.complete = false; stageProgress.errors.push({ dataset: "STAGE", code: "SOURCE_INVALID" }); }
    const publicStages: Stage[] = stages.items.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.stageId.localeCompare(b.stageId)).map(s => {
      const p = boundStageProgress.find(p => p.stageId === s.stageId);
      return { stageId: this.id(binding, "stage", s.stageId), title: s.title, ...(s.description ? { description: s.description } : {}), ...(s.displayOrder != null ? { displayOrder: s.displayOrder } : {}), ...(s.due ? { due: s.due } : {}), progress: p ? this.progress({ ...p, workId: work.workId }) : stageProgress.state === "SOURCE_ERROR" ? { dataState: "SOURCE_ERROR" } : unknownProgress() };
    });
    if (stageRef && !publicStages.some(s => s.stageId === stageRef)) throw notFound();
    const validResults = results.items.filter(r => !r.stageId || stages.items.some(s => s.stageId === r.stageId));
    if (validResults.length !== results.items.length) { results.complete = false; results.errors.push({ dataset: "ASSESSMENT", code: "SOURCE_INVALID" }); }
    return { data: { work: this.workSummary(binding, work, sourceProgress, progress.state), ...(work.description ? { description: work.description } : {}), ...(work.topicLabel ? { topic: work.topicLabel } : {}),
      progress: status, stages: publicStages, stagesState: listStatus(stages), results: validResults.map(r => ({ resultId: this.id(binding, "work-result", r.resultId), value: this.value(r.value), ...(r.stageId ? { stageId: this.id(binding, "stage", r.stageId) } : {}), ...(r.assessedAt ? { assessedAt: r.assessedAt } : {}) })), resultsState: listStatus(results),
      relatedMaterials: materials.items.filter(m => m.relatedWorkIds?.includes(publicWork)), materialsState: listStatus(materials.slice), ...(stageRef ? { focusStageId: stageRef } : {}) }, meta: this.meta([works, progress, stages, stageProgress, results, materials.slice]) };
  }
  // Проекция исходных дат; не создаёт самостоятельных копий учебных событий.
  async calendarFacts(binding: LearningBinding) {
    const works = await this.works(binding), facts: Array<{ sourceId:string; sourceRef:ExternalRef; id: string; title: string; date: AcademicDate; kind: "ACADEMIC_DEADLINE" | "ATTESTATION"; target: Target; location?: string }> = [];
    let complete = works.complete === true;
    for (const work of works.items) {
      const target: Target = { kind: "WORK", targetRef: this.id(binding, "work", work.workId) };
      if (work.due) facts.push({ sourceId:work.workId,sourceRef:work.ref,id: this.id(binding,"deadline-work",work.workId),title:`${binding.title}: ${work.title}`,date:work.due,kind:"ACADEMIC_DEADLINE",target });
      const stages=await this.read(binding,()=>this.port.getStages(binding.source,work.workId),"STAGE",s=>s.workId===work.workId);
      complete &&= stages.complete===true;
      for(const stage of stages.items) if(stage.due) facts.push({sourceId:stage.stageId,sourceRef:work.ref,id:this.id(binding,"deadline-stage",stage.stageId),title:`${binding.title}: ${work.title}: ${stage.title}`,date:stage.due,kind:"ACADEMIC_DEADLINE",target});
    }
    if(binding.kind==="OFFERING") {
      const attestations=await this.read(binding,()=>this.port.getAttestations(binding.source),"ATTESTATION",a=>a.periodId===binding.period.periodId&&a.offeringId===binding.source.offeringId);
      complete &&= attestations.complete===true;
      for(const a of attestations.items) if(a.planned) facts.push({sourceId:a.attestationId,sourceRef:a.ref,id:this.id(binding,"attestation",a.attestationId),title:`${binding.title}: ${a.kindLabel}`,date:a.planned,kind:"ATTESTATION",target:{kind:"ATTESTATION",targetRef:this.id(binding,"attestation",a.attestationId)},...(a.locationLabel?{location:a.locationLabel}:{})});
    }
    const scope=await this.context.resolve(binding.period,this.date(binding.period));
    const deadlines=await this.read(binding,()=>this.port.getDeadlines(binding.source),"WORK",d=>
      d.ref.objectKind==="ACADEMIC_DEADLINE"&&d.ref.externalId===d.deadlineId&&
      d.audiences.some(a=>audienceAllowed(scope,a,binding.source.offeringId))&&facts.some(f=>{
        const ref=f.kind==="ATTESTATION"?d.relatedAttestationRef:d.relatedWorkRef;
        const other=f.kind==="ATTESTATION"?d.relatedWorkRef:d.relatedAttestationRef;
        return !other&&ref?.sourceCode===f.sourceRef.sourceCode&&ref?.objectKind===f.sourceRef.objectKind&&ref?.externalId===f.sourceRef.externalId&&
          f.sourceId===d.deadlineId&&f.date.precision===d.due.precision&&f.date.on===d.due.on&&f.date.at===d.due.at&&f.date.timeZone===d.due.timeZone;
      }));
    const confirmed=new Set(deadlines.items.map(d=>d.deadlineId));
    return {facts:facts.filter(f=>confirmed.has(f.sourceId)),complete:complete&&deadlines.complete===true&&confirmed.size===facts.length};
  }
  async results(binding: LearningBinding) {
    const works = await this.works(binding);
    const [grading, components, attestations, official] = await Promise.all([
      this.read(binding, () => this.port.getGradingModel(binding.source), "ASSESSMENT", g => g.offeringId === binding.source.offeringId),
      this.read(binding, () => this.port.getAssessments(binding.source), "ASSESSMENT", c => c.offeringId === binding.source.offeringId),
      this.read(binding, () => this.port.getAttestations(binding.source), "ATTESTATION", a => a.periodId === binding.period.periodId && a.offeringId === binding.source.offeringId),
      this.read(binding, () => this.port.getCourseResults(binding.source), "ASSESSMENT", r => r.periodId === binding.period.periodId && r.offeringId === binding.source.offeringId && r.externalStudentId === this.context.identity.externalStudentId),
    ]);
    const result = official.items.length === 1 ? official.items[0] : undefined;
    if (official.items.length > 1) { official.complete = false; official.errors.push({ dataset: "ASSESSMENT", code: "SOURCE_INVALID" }); }
    const data: ResultsView = { gradingState: grading.state === "READY" && grading.items.length !== 1 ? "UNKNOWN" : grading.state, ...(grading.items.length === 1 ? { gradingModelLabel: grading.items[0].modelLabel } : {}),
      components: components.items.map(c => ({ componentId: this.id(binding, "component", c.componentId), label: c.label, state: c.valueState,
        ...(c.value ? { value: this.value(c.value) } : {}), ...(c.maxValue != null ? { maxValue: c.maxValue } : {}), ...(c.weightText?{weightText:c.weightText}:{}), ...(c.assessedAt ? { assessedAt: c.assessedAt } : {}),
        ...(c.linkedWorkRef && works.items.some(w => w.ref.sourceCode === c.linkedWorkRef!.sourceCode && w.ref.externalId === c.linkedWorkRef!.externalId && w.ref.objectKind === c.linkedWorkRef!.objectKind) ? { linkedWorkId: this.id(binding, "work", works.items.find(w => w.ref.externalId === c.linkedWorkRef!.externalId)!.workId) } : {}) })), componentsState: listStatus(components),
      attestations: attestations.items.map(a => ({ attestationId: this.id(binding, "attestation", a.attestationId), kindLabel: a.kindLabel, state: a.planned ? "READY" : "UNKNOWN", ...(a.planned ? { planned: a.planned } : {}), ...(a.locationLabel ? { location: a.locationLabel } : {}) })), attestationsState: listStatus(attestations),
      officialResultState: result?.resultState ?? (official.state === "SOURCE_ERROR" ? "SOURCE_ERROR" : "UNKNOWN"),
      ...(result ? { officialResult: { resultId: this.id(binding, "official-result", result.courseResultId), label: "Официальный итог по дисциплине", state: result.resultState, ...(result.result ? { value: this.value(result.result) } : {}), ...(result.assessedAt ? { assessedAt: result.assessedAt } : {}), ...(result.attestationId && attestations.items.some(a => a.attestationId === result.attestationId) ? { attestationId: this.id(binding, "attestation", result.attestationId) } : {}) } } : {}) };
    return { data, meta: this.meta([works, grading, components, attestations, official]), slices: [works, grading, components, attestations, official] };
  }
  async timeline(binding: LearningBinding) {
    const works = await this.works(binding), entries: TimelineEntry[] = [], errors: Slice<unknown>[] = [works];
    const instant = (at?: string): AcademicDate | undefined => at ? { precision: "DATE_TIME", at, timeZone: this.port.timeZone } : undefined;
    const add = (id: string, eventKind: TimelineEntry["eventKind"], when: AcademicDate | undefined, title: string, target: TimelineEntry["target"]) => { if (when) entries.push({ timelineKey: this.id(binding, "timeline", `${id}:${eventKind}`), eventKind, when, title, target }); };
    const addResult = (id: string, title: string, result: { state: DataState; value?: AssessmentValue; assessedAt?: string }, target: TimelineEntry["target"]) => {
      // Ожидание или отсутствие сведений не доказывает выставление оценки.
      // UNKNOWN с предметной датой сохраняет дату и неизвестность самого значения.
      if (result.state !== "READY" && result.state !== "KNOWN_ZERO" && !(result.state === "UNKNOWN" && result.assessedAt)) return;
      const when = instant(result.assessedAt);
      entries.push({ timelineKey: this.id(binding, "timeline", `${id}:ASSESSED`), eventKind: "ASSESSED", title, target,
        ...(when ? { when } : {}), resultState: result.state, ...(result.state !== "UNKNOWN" && result.value ? { value: result.value } : {}) });
    };
    for (const work of works.items) {
      const detail = await this.workDetail(binding, this.id(binding, "work", work.workId)), target = detail.data.work.target;
      if (detail.meta.completeness !== true) errors.push({ items: [], state: "UNKNOWN", complete: false, errors: detail.meta.partialErrors ?? [] });
      add(work.workId, "ISSUED", work.issued, work.title, target); add(work.workId, "DUE", work.due, work.title, target);
      add(work.workId, "COMPLETED", instant(detail.data.progress.completedAt), work.title, target); add(work.workId, "SUBMITTED", instant(detail.data.progress.submittedAt), work.title, target);
      add(work.workId, "REVIEWED", instant(detail.data.progress.reviewedAt), work.title, target);
      for (const result of detail.data.results) add(result.resultId, "ASSESSED", instant(result.assessedAt), work.title, target);
      for (const stage of detail.data.stages) { add(stage.stageId, "DUE", stage.due, `${work.title}: ${stage.title}`, target); add(stage.stageId, "COMPLETED", instant(stage.progress?.completedAt), stage.title, target); add(stage.stageId, "SUBMITTED", instant(stage.progress?.submittedAt), stage.title, target); add(stage.stageId, "REVIEWED", instant(stage.progress?.reviewedAt), stage.title, target); }
    }
    if (binding.kind === "OFFERING") {
      const results = await this.results(binding); errors.push(...results.slices);
      const offeringTarget: TimelineEntry["target"] = { kind: "OFFERING", targetRef: binding.publicContext };
      for (const component of results.data.components) {
        // Связанные с работой результаты уже представлены в её хронологии.
        // Без подтверждённой связи переход ведёт к дисциплине, а не к случайной работе.
        if (!component.linkedWorkId) addResult(component.componentId, `Результат: ${component.label}`, component, offeringTarget);
      }
      const official = results.data.officialResult;
      if (official) addResult(official.resultId, `${official.label}: ${binding.title}`, official, offeringTarget);
      for (const a of results.data.attestations) add(a.attestationId, "ATTESTATION", a.planned, `${a.kindLabel}: ${binding.title}`, { kind: "ATTESTATION", targetRef: a.attestationId });
      if (binding.period.startsOn && binding.period.endsOn) {
        let cursor: string | undefined;
        try { do {
          const page = await this.schedule.sessions(binding.publicPeriod, binding.publicContext, { from: binding.period.startsOn, to: binding.period.endsOn }, 100, cursor);
          for (const item of page.data.items) {
            add(item.schedule.scheduleId, "PLANNED", item.schedule.plannedStart ? { precision: "DATE_TIME", at: item.schedule.plannedStart, timeZone: item.schedule.timeZone! } : undefined, item.schedule.title, item.schedule.target);
            if (item.actual?.heldAt) add(item.actual.sessionId, "ACTUAL", { precision: "DATE_TIME", at: item.actual.heldAt, timeZone: item.schedule.timeZone! }, item.actual.topic ?? item.schedule.title, item.schedule.target);
            else if (item.actual?.heldOn) add(item.actual.sessionId, "ACTUAL", { precision: "DATE_ONLY", on: item.actual.heldOn }, item.actual.topic ?? item.schedule.title, item.schedule.target);
          }
          if (page.meta.completeness !== true) errors.push({ items: [], state: "UNKNOWN", complete: false, errors: page.meta.partialErrors ?? [] });
          cursor = page.data.nextCursor ?? undefined;
        } while (cursor); } catch (error) {
          if (error instanceof AppError && error.code === "SOURCE_REVISION_CHANGED") throw error;
          errors.push({ items: [], complete: false, state: "SOURCE_ERROR", errors: [{ dataset: "SCHEDULE", code: "SOURCE_UNAVAILABLE" }] });
        }
      }
    }
    entries.sort((a, b) => {
      // Подтверждённые результаты без даты идут отдельной группой после датированных.
      if (!a.when || !b.when) return Number(!a.when) - Number(!b.when) || a.timelineKey.localeCompare(b.timelineKey);
      const dayA = a.when.on ?? localDay(a.when.at!, a.when.timeZone!), dayB = b.when.on ?? localDay(b.when.at!, b.when.timeZone!);
      return dayB.localeCompare(dayA) || (a.when.at && b.when.at ? Date.parse(b.when.at) - Date.parse(a.when.at) : Number(!!a.when.at) - Number(!!b.when.at)) || a.eventKind.localeCompare(b.eventKind) || a.timelineKey.localeCompare(b.timelineKey);
    });
    return { items: entries, complete: !this.context.partial && errors.every(s => s.complete === true), slices: errors };
  }
  async offeringDetail(binding: LearningBinding) {
    if (binding.kind !== "OFFERING") throw notFound();
    const works = await this.works(binding), progress = await this.progressSlice(binding, works.items), [results, materials] = await Promise.all([this.results(binding), this.materials(binding, works.items)]);
    const period = binding.period;
    let sessions: Awaited<ReturnType<ScheduleService["sessions"]>> | null = null;
    try { sessions = period.startsOn && period.endsOn ? await this.schedule.sessions(binding.publicPeriod, binding.publicContext, { from: period.startsOn, to: period.endsOn }, 20) : null; }
    catch (error) { if (error instanceof AppError && error.code === "SOURCE_REVISION_CHANGED") throw error; }
    const workPage = pageSlice(works.items.map(w => this.workSummary(binding, w, progress.items.find(p => p.workId === w.workId), progress.state)), this.context.auth.accountId, ["works", binding.publicPeriod, binding.publicContext, 20], this.context.revision, 20);
    const data: OfferingDetail = { offering: await this.schedule.summary(binding.period, binding.source.offeringId!), sessions: sessions?.data.items ?? [], sessionsState: sessions ? { dataState: sessions.data.dataState, isComplete: sessions.data.isComplete, nextCursor: sessions.data.nextCursor } : { dataState: "SOURCE_ERROR", isComplete: false, nextCursor: null },
      works: workPage.items, worksState: { ...listStatus(works), nextCursor: workPage.nextCursor }, results: results.data, materials: materials.items, materialsState: listStatus(materials.slice),
      progressLines: { activity: works.state, completion: progress.state === "SOURCE_ERROR" ? "SOURCE_ERROR" : progress.items.some(p => p.completionStatusCode || p.completedAt) ? "READY" : "UNKNOWN", results: results.data.officialResultState } };
    return { data, meta: this.meta([works, progress, ...results.slices, materials.slice, ...(!sessions || sessions.meta.completeness === false ? [{ items: [], complete: false, state: "SOURCE_ERROR" as const, errors: sessions?.meta.partialErrors ?? [{ dataset: "SCHEDULE" as const, code: "SOURCE_UNAVAILABLE" as const }] }] : [])]) };
  }
  async sourceMaterial(binding: LearningBinding, publicId: string): Promise<SourceMaterial> {
    const { slice, items } = await this.materials(binding);
    if (slice.state === "SOURCE_ERROR") throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Источник материалов недоступен.");
    if (!items.some(m => m.materialId === publicId)) throw notFound();
    const raw = slice.items.find(m => this.id(binding, "material", m.materialId) === publicId);
    if (!raw) throw notFound(); return raw;
  }
  async *bindings(publicPeriod?: string) {
    const periods = publicPeriod ? [this.context.period(publicPeriod)] : this.context.record.periods;
    for (const period of periods) {
      const id = this.context.periodId(period);
      // Отказ одного каталога/семестра не стирает уже доступные соседние блоки.
      try { for (const offering of await this.context.getOfferings(period)) yield await this.bind(id, this.context.offeringId(period.periodId, offering.offeringId), "OFFERING"); }
      catch(error){if(error instanceof AppError&&(error.status===401||error.code==="SOURCE_REVISION_CHANGED"))throw error;this.context.markIncomplete();await this.sourceFailure();}
      try { for (const unit of (await this.units(id)).items) yield await this.bind(id, this.context.id("unit", period.periodId, unit.unitId), "INDEPENDENT_UNIT"); }
      catch(error){if(error instanceof AppError&&(error.status===401||error.code==="SOURCE_REVISION_CHANGED"))throw error;this.context.markIncomplete();await this.sourceFailure();}
    }
  }
  async unitDetail(binding: LearningBinding) {
    const units = await this.units(binding.publicPeriod), unit = units.items.find(u => this.context.id("unit", binding.period.periodId, u.unitId) === binding.publicContext);
    if (!unit) throw notFound();
    const slice = await this.works(binding), works: WorkDetail[] = [], slices: Slice<unknown>[] = [slice];
    for (const work of slice.items) {
      const detail = await this.workDetail(binding, this.id(binding, "work", work.workId)); works.push(detail.data);
      slices.push({ items: [], state: "READY", complete: detail.meta.completeness ?? null, errors: detail.meta.partialErrors ?? [] });
    }
    const timeline = await this.timeline(binding), materials = await this.materials(binding, slice.items);
    return { data: { unit: this.unitSummary(binding.period, unit), works, worksState: listStatus(slice), results: works.flatMap(w => w.results), materials: materials.items, attestations: [], timeline: timeline.items, timelineState: { dataState: timeline.items.length ? "READY" as const : timeline.complete ? "EMPTY_CONFIRMED" as const : "UNKNOWN" as const, isComplete: timeline.complete, nextCursor: null } }, meta: this.meta([...slices, ...timeline.slices, materials.slice]) };
  }
  async search(text: string, limit: number) {
    const normalized = text.normalize("NFKC").toLocaleLowerCase("ru-RU").trim(), items: { item: AcademicSearchResult; rank: number }[] = [];
    const slices: Slice<unknown>[] = [];
    for await (const binding of this.bindings()) {
      const current = this.context.currentPeriod()?.periodId === binding.period.periodId;
      const base = { periodId: binding.publicPeriod, periodLabel: binding.period.label };
      if (binding.kind === "OFFERING" && binding.title.toLocaleLowerCase("ru-RU").includes(normalized)) items.push({ item: { ...base, kind: "OFFERING", title: binding.title, targetRef: binding.publicContext }, rank: current ? 0 : 2 });
      const works = await this.works(binding); slices.push(works);
      for (const work of works.items) if (work.title.normalize("NFKC").toLocaleLowerCase("ru-RU").includes(normalized)) items.push({ item: { ...base, kind: "WORK", title: work.title, disciplineLabel: binding.title, targetRef: this.id(binding, "work", work.workId) }, rank: current ? 1 : 3 });
    }
    items.sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title, "ru-RU") || a.item.targetRef.localeCompare(b.item.targetRef));
    const meta = this.meta(slices);
    return { data: { items: items.slice(0, limit).map(i => i.item), completeness: meta.completeness ? "COMPLETE" as const : "PARTIAL" as const, hasMore: items.length > limit }, meta };
  }
  async allMaterials(filter: { periodId?: string; offeringId?: string; unitId?: string }) {
    const items: Material[] = [], slices: Slice<unknown>[] = [], bindings: LearningBinding[] = [];
    if (filter.offeringId && filter.unitId) throw new AppError(422, "VALIDATION_ERROR", "Укажите один учебный контекст.");
    if (filter.periodId && (filter.offeringId || filter.unitId)) bindings.push(await this.bind(filter.periodId, (filter.offeringId ?? filter.unitId)!, filter.offeringId ? "OFFERING" : "INDEPENDENT_UNIT"));
    else for await (const binding of this.bindings(filter.periodId)) if ((!filter.offeringId && !filter.unitId) || binding.publicContext === (filter.offeringId ?? filter.unitId)) bindings.push(binding);
    if ((filter.offeringId || filter.unitId) && !bindings.length) {
      if (this.context.partial) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Учебный контекст неполон. Попробуйте ещё раз.");
      throw notFound();
    }
    for (const binding of bindings) { const materials = await this.materials(binding); items.push(...materials.items); slices.push(materials.slice); }
    items.sort((a, b) => a.title.localeCompare(b.title, "ru-RU") || a.materialId.localeCompare(b.materialId));
    return { items, bindings, slices, meta: this.meta(slices, "material") };
  }
  async material(publicId: string) {
    const all = await this.allMaterials({}), item = all.items.find(m => m.materialId === publicId);
    if (!item) { if (all.meta.completeness === false) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Источник материалов неполон. Попробуйте ещё раз."); throw notFound(); }
    const binding = all.bindings.find(b => b.publicContext === (item.offeringId ?? item.unitId))!;
    return { item, raw: await this.sourceMaterial(binding, publicId), meta: all.meta };
  }
  async targetPath(target: Target) {
    let complete = !this.context.partial;
    for await (const binding of this.bindings()) {
      const base = binding.kind === "OFFERING" ? `/study/${binding.publicPeriod}/${binding.publicContext}` : `/study/${binding.publicPeriod}/units/${binding.publicContext}`;
      if ((target.kind === "OFFERING" || target.kind === "UNIT") && binding.publicContext === target.targetRef) return base;
      if (target.kind === "WORK") {
        const works = await this.works(binding); complete = complete && works.complete === true;
        for (const work of works.items) if (this.id(binding, "work", work.workId) === target.targetRef) return `${base}/works/${target.targetRef}`;
      }
      if (target.kind === "ATTESTATION") {
        const results = await this.results(binding); complete = complete && results.meta.completeness === true;
        if (results.data.attestations.some(a => a.attestationId === target.targetRef)) return `${base}?tab=results`;
      }
    }
    if (!complete || this.context.partial) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Часть учебных сведений недоступна. Попробуйте ещё раз.");
    throw notFound();
  }
}
