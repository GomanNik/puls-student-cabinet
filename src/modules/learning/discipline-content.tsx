"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, CalendarDays, CheckCircle2, Download, FileText, GraduationCap, Hourglass } from "lucide-react";
import type { OfferingDetail, ScheduleDetail, WorkSummary, Material, AssessmentComponent, SessionPage } from "@/shared/contracts/student-api";
import { academicDate, assessmentValue, dataStateText, targetHref } from "@/shared/ui/academic";
import { materialFormat } from "@/shared/lib/material-format";
import { PagedList } from "@/shared/ui/paged-list";
import { SessionListResponseSchema, TimelineListResponseSchema, WorkListResponseSchema } from "@/shared/contracts/student-api";
import { useRemote } from "@/shared/api/use-remote";
import { api, safeClientMessage } from "@/shared/api/client";
import type { TimelineEntry } from "@/shared/contracts/student-api";

function workStatus(work: WorkSummary) {
  const p = work.progress;
  if (!p || p.dataState === "SOURCE_ERROR") return p?.dataState === "SOURCE_ERROR" ? "Источник статусов недоступен" : "Статус не указан";
  return p.reviewStatusCode ?? p.submissionStatusCode ?? p.completionStatusCode ?? p.assignmentStatusCode ?? "Статус не указан";
}

function awaitingReview(work: WorkSummary) {
  const p = work.progress;
  return !!p?.submittedAt && !p.reviewedAt && !p.reviewStatusCode;
}

function needsAction(work: WorkSummary) {
  const p = work.progress;
  if (!p || p.dataState !== "READY" || awaitingReview(work)) return false;
  if (p.reviewStatusCode && /доработ|вернул/iu.test(p.reviewStatusCode)) return true;
  if (p.reviewedAt) return false;
  return !!work.due && !!p.submissionStatusCode && /не отправ|не сдан|не передан/iu.test(p.submissionStatusCode);
}

function workResult(work: WorkSummary, components: AssessmentComponent[]) {
  const linked = components.find(c => c.linkedWorkId === work.workId);
  return linked?.value ? assessmentValue(linked.value) : workStatus(work);
}

function SectionEmpty({ state, empty }: { state: OfferingDetail["worksState"]; empty: string }) {
  return <p className="discipline-empty">{state.dataState === "SOURCE_ERROR" ? "Источник временно недоступен. Обновите страницу, чтобы повторить запрос." : state.isComplete === true ? empty : "Сведения неполны. Обновите страницу позже."}</p>;
}

export function DisciplineMaterials({ items }: { items: Material[] }) {
  return <div className="discipline-material-grid">{items.map(item => <article key={item.materialId} className="discipline-material-card">
    <span className="discipline-file-icon" aria-hidden="true"><FileText size={25} /></span>
    <div className="discipline-material-copy"><h3><Link href={`/materials/${item.materialId}`} prefetch={false}>{item.title}</Link></h3><p>{item.kind === "FILE" ? `Файл · ${materialFormat(item)}` : "Внешняя ссылка"}{item.sizeBytes != null ? ` · ${Math.ceil(item.sizeBytes / 1024)} КБ` : ""}</p><Link className="discipline-material-open" href={`/materials/${item.materialId}`} prefetch={false}>Открыть</Link></div>
    {item.kind === "FILE" && <a className="discipline-download" href={`/api/v1/materials/${item.materialId}/download`} aria-label={`Скачать ${item.title}`}><Download size={19} /></a>}
  </article>)}</div>;
}

function AttendancePreview({ items, complete, base }: { items: ScheduleDetail[]; complete: boolean | null; base: string }) {
  const recorded = items.filter(item => item.attendance);
  return <section className="discipline-panel discipline-attendance"><div className="discipline-panel-head"><h2>Посещаемость</h2><Link href={`${base}?tab=performance#attendance`}>Журнал →</Link></div>
    {recorded.length ? <div className="discipline-attendance-list">{recorded.slice(0, 3).map(item => <div key={item.schedule.scheduleId}><span>{item.schedule.plannedStart && item.schedule.timeZone ? academicDate({ precision: "DATE_TIME", at: item.schedule.plannedStart, timeZone: item.schedule.timeZone }) : "Дата не указана"}</span><strong>{item.attendance!.statusLabel}</strong></div>)}</div> : <p className="discipline-empty">{complete === false ? "Сведения о посещаемости неполны" : "Данные о посещаемости пока не получены"}</p>}
  </section>;
}

export function DisciplineOverview({ detail, base }: { detail: OfferingDetail; base: string }) {
  const worksComplete = detail.worksState.isComplete === true && !detail.worksState.nextCursor;
  const reviewing = detail.works.filter(awaitingReview);
  const attention = detail.works.filter(needsAction);
  const attestation = detail.results.attestations[0];
  const recent = [...detail.works].filter(w => w.progress?.reviewedAt || w.progress?.submittedAt).sort((a, b) => (b.progress?.reviewedAt ?? b.progress?.submittedAt ?? "").localeCompare(a.progress?.reviewedAt ?? a.progress?.submittedAt ?? "")).slice(0, 3);
  return <div className="discipline-overview">
    <div className="discipline-stats">
      <Link className="discipline-stat" href={`${base}/works`}><span className="discipline-stat-icon"><FileText /></span><span>Работы: <strong>{worksComplete ? detail.works.length : detail.works.length ? `от ${detail.works.length}` : "—"}</strong></span></Link>
      <Link className="discipline-stat" href={`${base}/works?filter=REVIEW`}><span className="discipline-stat-icon"><Hourglass /></span><span>На проверке: <strong>{worksComplete ? reviewing.length : reviewing.length ? `от ${reviewing.length}` : "—"}</strong></span></Link>
      <Link className="discipline-stat discipline-stat-attestation" href={`${base}?tab=performance#attestation`}><span className="discipline-stat-icon"><GraduationCap /></span><span>Аттестация: <strong>{attestation ? `${attestation.kindLabel}${attestation.planned ? ` · ${academicDate(attestation.planned)}` : ""}` : dataStateText(detail.results.attestationsState.dataState)}</strong></span></Link>
    </div>
    <div className="discipline-main-grid">
      <section className="discipline-panel discipline-attention"><div className="discipline-panel-head"><h2>Требует внимания</h2><Link href={`${base}/works`}>Все работы →</Link></div>
        {attention.length ? <div className="discipline-attention-list">{attention.slice(0, 4).map(work => <Link href={targetHref(work.target)} key={work.workId} className="discipline-attention-item" prefetch={false}><span className="discipline-inline-icon"><FileText /></span><span className="discipline-attention-copy"><strong>{work.title}</strong><small><CalendarDays size={15} /> {work.due ? `Срок: ${academicDate(work.due)}` : "Срок не указан"}</small></span><span className="discipline-status">{workStatus(work)}</span></Link>)}</div> : <SectionEmpty state={detail.worksState} empty="Сейчас нет работ, требующих действий" />}
      </section>
      <div className="discipline-side-stack"><section className="discipline-panel discipline-recent"><div className="discipline-panel-head"><h2>Последние результаты</h2><Link href={`${base}?tab=performance`}>Подробнее →</Link></div>
        {recent.length ? <div className="discipline-recent-list">{recent.map(work => <Link key={work.workId} href={targetHref(work.target)} prefetch={false}><span className="discipline-inline-icon">{work.progress?.reviewedAt ? <CheckCircle2 /> : <Hourglass />}</span><span>{work.title}</span><strong>{workResult(work, detail.results.components)}</strong></Link>)}</div> : <SectionEmpty state={detail.worksState} empty="Результаты работ пока не опубликованы" />}
      </section><AttendancePreview items={detail.sessions} complete={detail.sessionsState.isComplete} base={base} /></div>
    </div>
    <section className="discipline-material-section"><div className="discipline-panel-head"><h2>Материалы по дисциплине</h2><Link href={`${base}?tab=materials`}>Все материалы →</Link></div>{detail.materials.length ? <DisciplineMaterials items={detail.materials.slice(0, 3)} /> : <SectionEmpty state={detail.materialsState} empty="Материалы пока не опубликованы" />}</section>
  </div>;
}

function WorkResultCard({ work, results, linkedResult, resultsState }: { work: WorkSummary; results: TimelineEntry[]; linkedResult?: AssessmentComponent; resultsState: "loading" | "unavailable" | "partial" | "complete" }) {
  const progress = work.progress;
  const unavailable = progress?.dataState === "SOURCE_ERROR";
  const published = results.filter(item => item.value);
  return <article className="discipline-result-card">
    <span className="status-tag">{work.workTypeLabel}</span>
    <h3><Link href={targetHref(work.target)} prefetch={false}>{work.title}</Link></h3>
    <p className="discipline-card-due">{work.due ? `Срок: ${academicDate(work.due)}` : "Срок не указан"}</p>
    <dl className="discipline-card-facts">
      <div><dt>Передача</dt><dd>{progress?.submissionStatusCode ?? (unavailable ? "Источник недоступен" : "Не указана")}</dd></div>
      <div><dt>Проверка</dt><dd>{progress?.reviewStatusCode ?? (unavailable ? "Источник недоступен" : "Не указана")}</dd></div>
      <div><dt>Результат</dt><dd>{published.length ? published.map(item => <span key={item.timelineKey}>{assessmentValue(item.value)}</span>) : linkedResult?.value ? assessmentValue(linkedResult.value) : resultsState === "complete" ? "Не опубликован" : resultsState === "loading" ? "Загружается" : resultsState === "partial" ? "Сведения неполны" : "Источник недоступен"}</dd></div>
    </dl>
    <Link className="discipline-card-action" href={targetHref(work.target)} prefetch={false}>Открыть работу →</Link>
  </article>;
}

function PublishedResults({ apiBase, components }: { apiBase: string; components: AssessmentComponent[] }) {
  const path = `${apiBase}/timeline?limit=100`;
  const { state, reload, isCurrent } = useRemote(path, TimelineListResponseSchema);
  const [extension, setExtension] = useState<{ base: unknown; items: TimelineEntry[]; nextCursor: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [path]);
  const extra = state.kind === "ready" && extension?.base === state.value ? extension : null;
  const all = state.kind === "ready" ? [...state.value.data.items, ...(extra?.items ?? [])] : [];
  const nextCursor = state.kind === "ready" ? extra ? extra.nextCursor : state.value.data.nextCursor : null;
  const results = all.filter(item => item.eventKind === "ASSESSED" && item.target.kind === "WORK");
  const resultsByWork = new Map<string, TimelineEntry[]>();
  for (const item of results) resultsByWork.set(item.target.targetRef, [...(resultsByWork.get(item.target.targetRef) ?? []), item]);
  const resultsState = state.kind === "loading" ? "loading" : state.kind === "error" ? "unavailable" : nextCursor || state.value.meta.sourceStatus === "PARTIAL" || state.value.data.isComplete !== true ? "partial" : "complete";
  async function more() {
    if (state.kind !== "ready" || !nextCursor || busy || pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(null);
    try {
      const page = await api(`${path}&cursor=${encodeURIComponent(nextCursor)}`, TimelineListResponseSchema, { signal: controller.signal });
      if (!controller.signal.aborted && isCurrent()) setExtension({ base: state.value, items: [...(extra?.items ?? []), ...page.data.items], nextCursor: page.data.nextCursor });
    } catch (cause) { if (!controller.signal.aborted) setError(safeClientMessage(cause)); }
    finally { if (pending.current === controller) { pending.current = null; if (!controller.signal.aborted) setBusy(false); } }
  }
  return <div className="discipline-journal">
    {state.kind === "error" && <p className="notice notice-warning" role="alert">Не удалось получить опубликованные результаты. <button type="button" onClick={reload}>Повторить</button></p>}
    {state.kind === "loading" && <p className="discipline-hint" aria-live="polite">Получаем опубликованные результаты…</p>}
    <PagedList path={`${apiBase}/works?limit=20`} schema={WorkListResponseSchema} empty="Работы пока не указаны." renderItem={work => <WorkResultCard key={work.workId} work={work} results={resultsByWork.get(work.workId) ?? []} linkedResult={components.find(item => item.linkedWorkId === work.workId)} resultsState={resultsState} />} />
    {error && <p className="notice notice-warning" role="alert">{error} Уже загруженные результаты сохранены.</p>}
    {nextCursor && <button className="button button-secondary" type="button" disabled={busy} onClick={() => void more()}>{busy ? "Загружаем…" : "Показать ещё результаты"}</button>}
    {state.kind === "ready" && state.value.meta.sourceStatus === "PARTIAL" && <p className="discipline-hint">Сведения о результатах могут быть неполными.</p>}
  </div>;
}

export function attendanceSummary(data: SessionPage) {
  const present = data.items.filter(item => item.attendance?.status === "PRESENT").length;
  const absent = data.items.filter(item => item.attendance?.status === "ABSENT").length;
  const other = data.items.filter(item => item.attendance?.status === "OTHER_RECORDED").length;
  const unavailable = data.items.filter(item => !item.attendance && item.attendanceState === "SOURCE_ERROR").length;
  const withoutMark = data.items.length - present - absent - other - unavailable;
  const scope = data.nextCursor || data.isComplete !== true ? "Среди загруженных занятий" : "По занятиям дисциплины";
  return `${scope}: ${data.items.length}. Присутствий: ${present}; пропусков: ${absent}; иных отметок: ${other}; без отметки: ${withoutMark}${unavailable ? `; источник отметок недоступен: ${unavailable}` : ""}.`;
}

export function DisciplinePerformance({ detail, apiBase }: { detail: OfferingDetail; apiBase: string }) {
  const components = detail.results.components;
  return <div className="discipline-performance">
    <section className="discipline-panel discipline-results-panel"><div className="discipline-panel-head"><h2>Результаты работ</h2></div>{detail.results.gradingModelLabel && <p className="discipline-hint">{detail.results.gradingModelLabel}</p>}
      <PublishedResults key={apiBase} apiBase={apiBase} components={components} />
      {components.some(c => !c.linkedWorkId) && <div className="discipline-other-results"><h3>Другие показатели</h3>{components.filter(c => !c.linkedWorkId).map(c => <div className="discipline-unlinked-result" key={c.componentId}><span>{c.label}</span><strong>{c.value ? assessmentValue(c.value) : dataStateText(c.state)}</strong></div>)}</div>}
    </section>
    <section className="discipline-panel discipline-attendance-panel" id="attendance"><div className="discipline-panel-head"><h2>Посещаемость</h2></div><p className="discipline-hint">Отсутствие отметки не означает пропуск занятия.</p>
      <PagedList path={`${apiBase}/sessions?limit=20`} schema={SessionListResponseSchema} empty="Занятия пока не указаны." renderSummary={data => <p className="discipline-attendance-summary" aria-live="polite">{attendanceSummary(data)}</p>} renderItem={item => <article className="discipline-session-card" key={item.schedule.scheduleId}><span className="discipline-session-date">{item.schedule.plannedStart && item.schedule.timeZone ? academicDate({ precision: "DATE_TIME", at: item.schedule.plannedStart, timeZone: item.schedule.timeZone }) : "Дата не указана"}</span><h3>{item.actual?.topic ?? item.schedule.title}</h3><p>{item.schedule.lessonType ?? "Тип занятия не указан"}</p><strong>{item.attendance?.statusLabel ?? (item.attendanceState === "SOURCE_ERROR" ? "Источник отметок недоступен" : "Нет отметки")}</strong></article>} />
    </section>
    <section className="discipline-panel" id="attestation"><div className="discipline-panel-head"><h2>Аттестация и официальный итог</h2></div><div className="discipline-attestation-grid"><div><span className="discipline-inline-icon"><GraduationCap /></span><h3>Аттестация</h3>{detail.results.attestations.length ? detail.results.attestations.map(a => <p key={a.attestationId}>{a.kindLabel}{a.planned ? ` · ${academicDate(a.planned)}` : " · Дата не указана"}{a.location ? ` · ${a.location}` : ""}</p>) : <p>{dataStateText(detail.results.attestationsState.dataState)}</p>}</div><div><span className="discipline-inline-icon"><BookOpen /></span><h3>Официальный итог</h3><p>{detail.results.officialResult?.value ? assessmentValue(detail.results.officialResult.value) : dataStateText(detail.results.officialResultState)}</p></div></div></section>
  </div>;
}
