"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRemote } from "@/shared/api/use-remote";
import * as dto from "@/shared/contracts/student-api";
import { RemoteState } from "@/shared/ui/remote-state";
import { PagedList } from "@/shared/ui/paged-list";
import { MaterialCards, ProgressFacts, academicDate, assessmentValue, dataStateText, targetHref } from "@/shared/ui/academic";
import { Button } from "@/shared/ui/button";
import { PageHero } from "@/shared/ui/page-hero";
import { ScheduleCard } from "@/shared/ui/schedule-card";
import { DisciplineMaterials, DisciplineOverview, DisciplinePerformance } from "./discipline-content";
import { OfferingTabs } from "./offering-tabs";

export function WorkCard({ work, detailed = false }: { work: dto.WorkSummary; detailed?: boolean }) {
  const status = work.progress?.reviewStatusCode ?? work.progress?.submissionStatusCode ?? work.progress?.completionStatusCode ?? work.progress?.assignmentStatusCode;
  return <article className="surface work-card"><span className="status-tag">{work.workTypeLabel}</span><h3><Link href={targetHref(work.target)} prefetch={false}>{work.title}</Link></h3><div className="work-card-facts"><span>{work.due ? `Срок: ${academicDate(work.due)}` : "Срок не указан"}</span>{!detailed && <span>{status ?? (work.progress?.dataState === "SOURCE_ERROR" ? "Источник недоступен" : "Состояние не указано")}</span>}</div>{detailed && <><div className="work-card-stages"><span><small>Передача</small>{work.progress?.submissionStatusCode ?? (work.progress?.dataState === "SOURCE_ERROR" ? "Источник недоступен" : "Не указана")}</span><span><small>Проверка</small>{work.progress?.reviewStatusCode ?? (work.progress?.dataState === "SOURCE_ERROR" ? "Источник недоступен" : "Не указана")}</span></div><Link className="work-card-open" href={targetHref(work.target)} prefetch={false}>Открыть работу →</Link></>}</article>;
}
export function ResultsSection({ value }: { value: dto.ResultsView }) {
  return <div className="learning-sections learning-performance"><section className="surface"><h2>Текущий контроль</h2>{value.gradingModelLabel && <p className="muted">{value.gradingModelLabel}</p>}{value.components.length ? <div className="result-table" role="table" aria-label="Оценочные компоненты"><div role="row" className="result-row table-head"><span role="columnheader">Компонент</span><span role="columnheader">Результат</span><span role="columnheader">Шкала</span></div>{value.components.map(c => <div role="row" className="result-row" key={c.componentId}><span role="cell">{c.label}</span><strong role="cell">{c.value ? assessmentValue(c.value) : dataStateText(c.state)}</strong><span role="cell">{c.maxValue != null ? `Максимум ${c.maxValue}` : "Не указана"}{c.weightText ? ` · Вес: ${c.weightText}` : ""}</span></div>)}</div> : <p className="muted">{value.gradingState === "NOT_APPLICABLE" ? "Баллы по этой дисциплине не предусмотрены." : dataStateText(value.componentsState.dataState)}</p>}</section><section className="surface learning-performance-final"><h2>Аттестация и официальный итог</h2><div className="learning-performance-final-grid"><div><h3>Аттестация</h3>{value.attestations.length ? value.attestations.map(a => <div className="attestation-card" key={a.attestationId}><h4>{a.kindLabel}</h4><p>{a.planned ? academicDate(a.planned) : "Дата не указана"}</p>{a.location && <p className="muted">{a.location}</p>}</div>) : <p>{dataStateText(value.attestationsState.dataState)}</p>}</div><div><h3>Официальный итог</h3><p className="result-value">{value.officialResult?.value ? assessmentValue(value.officialResult.value) : dataStateText(value.officialResultState)}</p>{value.officialResult?.assessedAt && <p className="muted small">Дата результата: {new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Omsk", dateStyle: "long" }).format(new Date(value.officialResult.assessedAt))}</p>}</div></div></section></div>;
}
const eventLabels = { ISSUED: "Выдано", DUE: "Срок", COMPLETED: "Выполнено", SUBMITTED: "Передано на проверку", ASSESSED: "Оценено", REVIEWED: "Проверено", ACTUAL: "Подтверждено проведение", ATTESTATION: "Аттестация", PLANNED: "По расписанию" };
export function TimelineCard({ item }: { item: dto.TimelineEntry }) { return <article className="timeline-card"><span className="timeline-date">{item.when ? academicDate(item.when) : "Дата не указана"}</span><div><span className="status-tag">{eventLabels[item.eventKind]}</span><h3><Link href={targetHref(item.target)} prefetch={false}>{item.title}</Link></h3>{item.resultState && <p>{item.value ? assessmentValue(item.value) : dataStateText(item.resultState)}</p>}</div></article>; }
export function OfferingScreen({ periodId, offeringId }: { periodId: string; offeringId: string }) {
  const params = useSearchParams(), base = `/periods/${periodId}/offerings/${offeringId}`, pageBase = `/study/${periodId}/${offeringId}`;
  const { state, reload } = useRemote(base, dto.OfferingDetailResponseSchema);
  const periods = useRemote("/periods", dto.PeriodListResponseSchema);
  const requested = params.get("tab") ?? "overview";
  if (state.kind !== "ready") return <main id="main" className="workspace"><h1>Дисциплина</h1><RemoteState state={state} retry={reload} /></main>;
  const detail = state.value.data;
  const periodLabel = periods.state.kind === "ready" ? periods.state.value.data.items.find(p => p.periodId === periodId)?.label : undefined;
  const availableTab = ["overview", "performance", "materials", "sessions", "timeline"].includes(requested);
  const tab = requested === "results" ? "performance" : availableTab ? requested : "overview";
  return <main id="main" className="workspace learning-r9-main discipline-page"><PageHero className="discipline-hero" title={detail.offering.title} description={`${periodLabel ? `${periodLabel} · ` : ""}${detail.offering.subgroup.dataState === "READY" ? detail.offering.subgroup.label ?? "Для всей группы" : "Официальная подгруппа не определена"}`} image="study-overview.jpg"/>{state.value.meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning">Часть сведений недоступна или неполна. Остальные разделы доступны.</p>}{tab === "overview" && requested !== "overview" && <p className="notice">Для этой дисциплины раздел не предусмотрен. Открыт обзор.</p>}<OfferingTabs base={pageBase} active={tab} />
    {tab === "overview" && <DisciplineOverview detail={detail} base={pageBase} />}
    {tab === "sessions" && <><p className="notice notice-info">План и проведение — разные факты. Отсутствующая отметка посещаемости не считается пропуском.</p><PagedList path={`${base}/sessions?limit=20`} schema={dto.SessionListResponseSchema} renderItem={item => <section key={item.schedule.scheduleId} className="session-facts"><ScheduleCard entry={item.schedule} href={`/schedule/${item.schedule.scheduleId}`} /><dl className="session-facts-row"><div><dt>Проведение</dt><dd>{item.actual ? item.actual.held ? "Подтверждено" : "Не проведено по данным источника" : dataStateText(item.actualState)}</dd></div><div><dt>Ваша посещаемость</dt><dd>{item.attendance?.statusLabel ?? dataStateText(item.attendanceState)}</dd></div></dl></section>} /></>}
    {tab === "performance" && <DisciplinePerformance detail={detail} apiBase={base} />}{tab === "timeline" && <><h2 className="learning-legacy-title">Хронология учебных событий</h2><PagedList path={`${base}/timeline?limit=20`} schema={dto.TimelineListResponseSchema} renderItem={item => <TimelineCard key={item.timelineKey} item={item} />} /></>}{tab === "materials" && <section className="discipline-material-section"><div className="discipline-panel-head"><h2>Материалы по дисциплине</h2></div>{detail.materials.length ? <DisciplineMaterials items={detail.materials} /> : <p className="notice">{dataStateText(detail.materialsState.dataState)}</p>}</section>}
  </main>;
}
function moment(at: string) { return `${academicDate({ precision: "DATE_ONLY", on: at.slice(0, 10) })}, ${at.slice(11, 16)} (${at.endsWith("Z") ? "UTC" : `UTC${at.slice(-6)}`})`; }
export function WorkScreen({ periodId, contextId, workId, unit = false }: { periodId: string; contextId: string; workId: string; unit?: boolean }) {
  const params = useSearchParams(), stageRef = params.get("stageRef"), base = `/periods/${periodId}/${unit ? "academic-units" : "offerings"}/${contextId}`;
  const { state, reload } = useRemote(`${base}/works/${workId}${stageRef ? `?stageRef=${encodeURIComponent(stageRef)}` : ""}`, dto.WorkDetailResponseSchema), stageFocused = useRef<string | null>(null);
  useEffect(() => { if (state.kind === "ready" && state.value.data.focusStageId && stageFocused.current !== state.value.data.focusStageId) { const element = document.getElementById(state.value.data.focusStageId); element?.focus(); element?.scrollIntoView(); stageFocused.current = state.value.data.focusStageId; } }, [state]);
  if (state.kind !== "ready") return <main id="main" className="workspace"><h1>Учебная работа</h1><RemoteState state={state} retry={reload} /></main>;
  const detail = state.value.data, progress = detail.progress;
  return <main id="main" className="workspace learning-r9-main">
    <PageHero eyebrow={detail.work.workTypeLabel} title={detail.work.title} description={detail.work.due ? `Срок выполнения: ${academicDate(detail.work.due)}. Подробности задания, этапы и результат — ниже.` : "Подробности задания, этапы выполнения и результат."} image={detail.stages.length ? "course-project.jpg" : "work-notes.jpg"}/>
    {state.value.meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning">Часть сведений недоступна. Неизвестные статусы не означают невыполнение.</p>}
    <div className="learning-sections learning-work-layout">
      {(detail.description || detail.topic) && <section className="surface learning-work-wide"><h2>Задание</h2>{detail.topic && <h3>{detail.topic}</h3>}{detail.description && <p className="plain-text">{detail.description}</p>}</section>}
      <section className="surface"><h2>Сроки и история</h2><dl className="data-list"><div><dt>Выдано</dt><dd>{academicDate(detail.work.issued)}</dd></div><div><dt>Срок</dt><dd>{detail.work.due ? academicDate(detail.work.due) : "Срок не указан"}</dd></div>{[["Выполнено", progress.completedAt], ["Передано на проверку", progress.submittedAt], ["Проверено", progress.reviewedAt]].map(([label, at]) => at ? <div key={label}><dt>{label}</dt><dd>{moment(at)}</dd></div> : null)}</dl></section>
      <section className="surface"><h2>Выполнение и проверка</h2><ProgressFacts progress={progress} /></section>
      <section className="surface learning-work-wide"><h2>Результат</h2>{detail.results.length ? detail.results.map(r => <div key={r.resultId}><p className="result-value">{assessmentValue(r.value)}</p>{r.assessedAt && <p className="muted small">Оценено: {moment(r.assessedAt)}</p>}</div>) : <p>{dataStateText(detail.resultsState.dataState)}</p>}</section>
      <section className="learning-work-wide"><h2>Этапы</h2>{detail.stages.length ? detail.stages.map(stage => <section className="surface stage-card" key={stage.stageId} id={stage.stageId} tabIndex={-1}><h3>{stage.title}</h3>{stage.description && <p>{stage.description}</p>}<p className="muted">Срок: {academicDate(stage.due)}</p><ProgressFacts progress={stage.progress ?? { dataState: "UNKNOWN" }} /></section>) : <p className="notice">{detail.stagesState.dataState === "SOURCE_ERROR" ? "Сведения об этапах временно недоступны" : "Сведения об этапах пока не указаны."}</p>}</section>
      <section className="learning-work-wide"><h2>Связанные материалы</h2>{detail.relatedMaterials.length ? <MaterialCards items={detail.relatedMaterials} /> : <p className="notice">{dataStateText(detail.materialsState.dataState)}</p>}</section>
    </div><Button asChild variant="secondary"><Link href={unit ? `/study/${periodId}/units/${contextId}` : `/study/${periodId}/${contextId}?tab=works`}>Вернуться к работам</Link></Button>
  </main>;
}
export function UnitScreen({ periodId, unitId }: { periodId: string; unitId: string }) {
  const { state, reload } = useRemote(`/periods/${periodId}/academic-units/${unitId}`, dto.UnitDetailResponseSchema);
  if (state.kind !== "ready") return <main id="main" className="workspace"><h1>Учебная единица</h1><RemoteState state={state} retry={reload} /></main>;
  const value = state.value.data;
  return <main id="main" className="workspace learning-r9-main"><PageHero title={value.unit.title} description="Работы, материалы, результаты и важные даты." image="independent-project.jpg"/>{state.value.meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning">Сведения неполны.</p>}<div className="learning-sections learning-unit-layout">
    <section className="learning-unit-wide"><div className="section-heading"><h2>Работы</h2><Link href={`/study/${periodId}/units/${unitId}/works`}>Фильтры и сортировка →</Link></div>{value.works.length ? <div className="record-list">{value.works.map(w => <WorkCard key={w.work.workId} work={w.work} />)}</div> : <p className="notice">{dataStateText(value.worksState.dataState)}</p>}</section>
    <section className="surface"><h2>Результаты</h2>{value.results.length ? value.results.map(result => <div className="learning-unit-result" key={result.resultId}><strong>{result.label ?? "Результат"}: {assessmentValue(result.value)}</strong>{result.assessedAt && <small>Дата: {moment(result.assessedAt)}</small>}</div>) : <p>Сведения о результатах не указаны.</p>}</section>
    <section className="surface"><h2>Аттестация</h2>{value.attestations.length ? value.attestations.map(item => <div className="attestation-card" key={item.attestationId}><h3>{item.kindLabel}</h3><p>{item.planned ? academicDate(item.planned) : "Дата не указана"}</p>{item.location && <p className="muted">{item.location}</p>}</div>) : <p>Сведения об аттестации не указаны.</p>}</section>
    <section className="learning-unit-wide"><h2>Материалы</h2>{value.materials.length ? <MaterialCards items={value.materials} /> : <p className="notice">Связанные материалы не указаны.</p>}</section>
    <section className="learning-unit-wide"><h2>Хронология</h2>{value.timeline.length ? value.timeline.map(item => <TimelineCard key={item.timelineKey} item={item} />) : <p className="notice">{dataStateText(value.timelineState.dataState)}</p>}</section>
  </div></main>;
}
