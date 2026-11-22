import "server-only";
import { ref, studentFixture, fixtureSchedule } from "./academic-fixtures";
import type { SourceLearningScope, } from "./learning-port";
import type { SourcePeriod } from "./academic-port";
import type { AcademicUnit, AcademicWork, WorkProgress, Stage, StageProgress, WorkResult, AssessmentComponent, GradingModel, Attestation, CourseResult, Material, AcademicDate, Audience } from "./contracts";

import { learningAssets } from "./learning-assets";
const on = (date: string): AcademicDate => ({ precision: "DATE_ONLY", on: date });
export function fixtureUnits(scope: SourcePeriod): AcademicUnit[] {
  if (!studentFixture(scope.externalStudentId)?.context.periods.some(p => p.periodId === scope.periodId)) return [];
  const unitId = `${scope.externalStudentId}:${scope.periodId}:independent-project`;
  return [{ ref: ref("ACADEMIC_UNIT", unitId), unitId, periodId: scope.periodId, title: "Индивидуальный исследовательский проект", unitTypeLabel: "Самостоятельная учебная единица",
    audiences: [{ scopeType: "STUDENT", scopeId: scope.externalStudentId }] }];
}
export function fixtureLearning(scope: SourceLearningScope) {
  const student = studentFixture(scope.externalStudentId), offering = student?.offerings.find(o => o.periodId === scope.periodId && o.offeringId === scope.offeringId);
  const unit = scope.unitId ? fixtureUnits(scope).find(u => u.unitId === scope.unitId) : undefined;
  const valid = !!offering || !!unit, contextId = scope.offeringId ?? scope.unitId;
  const context = scope.offeringId ? { offeringId: scope.offeringId } : { unitId: scope.unitId! };
  const audiences: Audience[] = [{ scopeType: "STUDENT", scopeId: scope.externalStudentId }];
  const math = scope.offeringId?.endsWith("math"), history = scope.offeringId?.endsWith("history"), pe = scope.offeringId?.endsWith("pe");
  const archived = scope.periodId === "spring-2026", month = archived ? "2026-05" : "2026-11";
  const works: AcademicWork[] = !valid ? [] : Array.from({ length: math ? 26 : unit ? 1 : history ? 4 : 3 }, (_, i) => {
    const workId = `${contextId}:work-${i + 1}`, coursework = !!unit || !!history && i === 3;
    return { ref: ref("WORK", workId), workId, periodId: scope.periodId, ...context, title: coursework ? "Курсовой проект: исследование источников" : math ? `Лабораторная работа № ${i + 1}${i === 25 ? ": численные методы" : ""}` : history ? ["Семинар: исторический источник", "Подготовить конспект", "Индивидуальное задание"][i] : pe ? ["Бег на короткую дистанцию", "Упражнения на выносливость", "Техника безопасности"][i] : `Практическая работа № ${i + 1}`,
      workTypeCode: coursework ? "COURSEWORK" : math ? "LAB" : history ? ["SEMINAR", "ASSIGNED_NOTES", "INDIVIDUAL"][i] : "PRACTICE", workTypeLabel: coursework ? "Курсовой проект" : math ? "Лабораторная работа" : history ? ["Семинар", "Конспект как задание", "Индивидуальное задание"][i] : pe ? "Норматив" : "Практическая работа",
      description: "Изучите предложенный материал и подготовьте решение с обоснованием. Сдача и проверка выполняются в вымышленной университетской системе; кабинет отображает переданные ею сведения.",
      ...(coursework ? { topicLabel: "Сопоставление методов исследования и представление результатов" } : {}), issued: on(`${month}-02`), ...(i % 4 !== 2 || coursework || i === 2 ? { due: on(`${month}-${String(Math.min(28, i + 14)).padStart(2, "0")}`) } : {}), audiences };
  });
  const progress: WorkProgress[] = works.filter((_, i) => i === 1 || i === 2).map((w, i) => ({ ref: ref("WORK_PROGRESS", `${scope.externalStudentId}:${w.workId}`), externalStudentId: scope.externalStudentId, workId: w.workId,
    assignmentStatusCode: "Выдано", completionStatusCode: "Выполнение подтверждено", submissionStatusCode: "Передано на проверку", submittedAt: `${month}-09T12:00:00+06:00`,
    ...(i === 1 ? { reviewStatusCode: "Проверено", reviewedAt: `${month}-10T10:00:00+06:00` } : {}) }));
  const coursework = works.find(w => w.workTypeCode === "COURSEWORK");
  const stages: Stage[] = coursework && !unit ? ["План и источники", "Исследование и защита"].map((title, i) => ({ ref: ref("WORK_STAGE", `${coursework.workId}:stage-${i}`), stageId: `${coursework.workId}:stage-${i}`, workId: coursework.workId, title, displayOrder: i, due: on(`${month}-${i === 0 ? "16" : "28"}`) })) : [];
  const stageProgress: StageProgress[] = stages[0] ? [{ ref: ref("STAGE_PROGRESS", `${scope.externalStudentId}:${stages[0].stageId}`), stageId: stages[0].stageId, externalStudentId: scope.externalStudentId, submissionStatusCode: "Передано на проверку", submittedAt: `${month}-12T11:30:00+06:00` }] : [];
  const workResults: WorkResult[] = works[2] ? [{ ref: ref("WORK_RESULT", `${works[2].workId}:result`), resultId: `${works[2].workId}:result`, workId: works[2].workId, externalStudentId: scope.externalStudentId,
    value: math ? { kind: "NUMERIC", numeric: "0", rawValueText: "0 баллов" } : { kind: "TEXT", text: "Зачтено", rawValueText: "Зачтено" }, assessedAt: `${month}-10T10:00:00+06:00`, ...(math ? { linkedComponentRef: ref("ASSESSMENT_COMPONENT", `${contextId}:component-1`) } : {}) }] : [];
  const grading: GradingModel[] = !valid || !math ? [] : [{ ref: ref("GRADING_MODEL", `${contextId}:grading`), offeringId: scope.offeringId!, modelLabel: "Балльно-рейтинговая система", modelCode: "POINTS" }];
  const assessments: AssessmentComponent[] = !math || !works[2] ? [] : [{ ref: ref("ASSESSMENT_COMPONENT", `${contextId}:component-1`), componentId: `${contextId}:component-1`, offeringId: scope.offeringId!, label: "Лабораторная работа № 3", maxValue: "10", weightText: "10 %", value: workResults[0].value,
    valueState: "KNOWN_ZERO", assessedAt: workResults[0].assessedAt, linkedWorkRef: works[2].ref }];
  const attestationId = `${contextId}:attestation`;
  const attestations: Attestation[] = !valid || !offering ? [] : [{ ref: ref("ATTESTATION", attestationId), attestationId, periodId: scope.periodId, offeringId: scope.offeringId!, kindLabel: math ? "Экзамен" : "Зачёт",
    planned: on(archived ? "2026-06-10" : "2027-01-15"), locationLabel: "Аудитория 201" }];
  const courseResults: CourseResult[] = !valid || !offering ? [] : [{ ref: ref("COURSE_RESULT", `${contextId}:official`), courseResultId: `${contextId}:official`, periodId: scope.periodId, offeringId: scope.offeringId!, externalStudentId: scope.externalStudentId,
    resultState: archived ? "READY" : "PENDING", ...(archived ? { result: { kind: "TEXT" as const, text: math ? "Хорошо" : "Зачтено" }, assessedAt: "2026-06-10T12:00:00+06:00" } : {}), attestationId }];
  const lessonRefs = scope.offeringId
    ? fixtureSchedule(scope.externalStudentId, scope.periodId, `${month}-02`, `${month}-08`)
      .filter(record => record.offeringId === scope.offeringId && !record.subgroupId && record.lessonType === "Лекция")
      .slice(0, 1).map(record => record.ref)
    : [];
  const materials:Material[]=!valid?[]:Object.entries(learningAssets).map(([key,asset])=>({
    ref:ref("MATERIAL",`${contextId}:material-${key}`),materialId:`${contextId}:material-${key}`,title:asset.filename,kind:"FILE",resourceHandle:`fixture-file:${key}`,mimeType:asset.mime,...context,
    // Конспект является материалом конкретной лекции, а не самостоятельным заданием.
    relatedClassRefs:key==="notes"||key==="guide"?lessonRefs:[],relatedWorkRefs:key==="notes"?[]:key==="guide"||key==="solution"?works[2]?[works[2].ref]:works[0]?[works[0].ref]:[]:works[0]?[works[0].ref]:[],audiences
  }));
  if(valid){
    materials.push({ref:ref("MATERIAL",`${contextId}:material-link`),materialId:`${contextId}:material-link`,title:"Пример внешнего ресурса",kind:"LINK",publicHttpsUrl:"https://example.org/",...context,audiences});
    materials.push({ref:ref("MATERIAL",`${contextId}:material-restricted`),materialId:`${contextId}:material-restricted`,title:"Материал другой аудитории",kind:"FILE",resourceHandle:"fixture-file:guide",mimeType:"application/pdf",...context,audiences:[{scopeType:"STUDENT",scopeId:scope.externalStudentId==="fixture-student-a"?"fixture-student-b":"fixture-student-a"}]});
  }
  return { works, progress, stages, stageProgress, workResults, grading, assessments, attestations, courseResults, materials };
}