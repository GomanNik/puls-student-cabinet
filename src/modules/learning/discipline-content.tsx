"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, CheckCircle2, Download, FileText, GraduationCap, Hourglass } from "lucide-react";
import type { OfferingDetail, ScheduleDetail, WorkSummary, Material, AssessmentComponent, SessionPage } from "@/shared/contracts/student-api";
import { academicDate, assessmentValue, dataStateText, targetHref } from "@/shared/ui/academic";
import { materialFormat } from "@/shared/lib/material-format";
import { PagedList } from "@/shared/ui/paged-list";
import { SessionListResponseSchema, WorkListResponseSchema } from "@/shared/contracts/student-api";
import { WorkStatusBadge } from "./work-status-badge";
import { getWorkStatus } from "./work-status";

function workResult(work: WorkSummary, components: AssessmentComponent[]) {
  if (work.publishedResult) return assessmentValue(work.publishedResult.value);
  const linked = components.find(component => component.linkedWorkId === work.workId);
  return linked?.value ? assessmentValue(linked.value) : "Результат опубликован";
}

function requiresAttention(work: WorkSummary) {
  const status = getWorkStatus(work.progress, work.publishedResult);
  return status === "NEEDS_REVISION" || status === "NOT_SUBMITTED" || status === "NOT_COMPLETED";
}

function SectionEmpty({ state, empty }: { state: OfferingDetail["worksState"]; empty: string }) {
  return <p className="discipline-empty">{state.dataState === "SOURCE_ERROR" ? "Источник временно недоступен. Обновите страницу, чтобы повторить запрос." : state.isComplete === true ? empty : "Сведения неполны. Обновите страницу позже."}</p>;
}

function reviewedWorksLabel(count: number) {
  if (count === 0) return "Пока нет проверенных работ";
  const lastTwo = count % 100;
  const last = count % 10;
  const singular = last === 1 && lastTwo !== 11;
  const few = last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  const verb = singular ? "Проверена" : few ? "Проверены" : "Проверено";
  const noun = singular ? "работа" : few ? "работы" : "работ";
  return `${verb} ${count} ${noun}`;
}

function awaitingReviewLabel(count: number) {
  if (count === 0) return "Нет работ, ожидающих проверки";
  const singular = count % 10 === 1 && count % 100 !== 11;
  return singular ? "Ждёт проверки преподавателя" : "Ждут проверки преподавателя";
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
  const attention = detail.works.filter(requiresAttention);
  const attestation = detail.results.attestations[0];
  const resultDate = (work: WorkSummary) => work.publishedResult?.assessedAt
    ?? detail.results.components.find(component => component.linkedWorkId === work.workId)?.assessedAt
    ?? work.progress?.reviewedAt
    ?? "";
  const recent = detail.works
    .filter(work => work.publishedResult || detail.results.components.some(component => component.linkedWorkId === work.workId && component.value))
    .sort((a, b) => resultDate(b).localeCompare(resultDate(a)))
    .slice(0, 3);
  const workCounts = detail.workCounts;
  const totalLabel = workCounts?.total == null ? "—" : String(workCounts.total);
  const reviewLabel = workCounts?.awaitingReview == null ? "—" : String(workCounts.awaitingReview);
  const reviewedHint = workCounts?.reviewed == null ? "Количество проверенных работ неизвестно" : reviewedWorksLabel(workCounts.reviewed);
  const reviewHint = workCounts?.awaitingReview == null
    ? "Не удалось определить точное количество"
    : awaitingReviewLabel(workCounts.awaitingReview);
  return <div className="discipline-overview">
    <div className="discipline-stats">
      <Link className="discipline-stat" href={`${base}/works`}>
        <span className="discipline-stat-icon"><FileText /></span>
        <span className="discipline-stat-copy"><span className="discipline-stat-main"><span className="discipline-stat-title">Всего заданий</span><strong className="discipline-stat-value">{totalLabel}</strong></span><span className="discipline-stat-hint">{reviewedHint}</span></span>
      </Link>
      <Link className="discipline-stat" href={`${base}/works?filter=REVIEW`}>
        <span className="discipline-stat-icon"><Hourglass /></span>
        <span className="discipline-stat-copy"><span className="discipline-stat-main"><span className="discipline-stat-title">На проверке</span><strong className="discipline-stat-value">{reviewLabel}</strong></span><span className="discipline-stat-hint">{reviewHint}</span></span>
      </Link>
      <Link className="discipline-stat discipline-stat-attestation" href={`${base}?tab=performance#attestation`}>
        <span className="discipline-stat-icon"><GraduationCap /></span>
        <span className="discipline-stat-copy"><span className="discipline-stat-title">Аттестация</span><strong className="discipline-stat-attestation-value">{attestation ? `${attestation.kindLabel}${attestation.planned ? ` · ${academicDate(attestation.planned)}` : ""}` : dataStateText(detail.results.attestationsState.dataState)}</strong></span>
      </Link>
    </div>
    <div className="discipline-main-grid">
      <section className="discipline-panel discipline-attention"><div className="discipline-panel-head"><h2>Требуют внимания</h2><Link href={`${base}/works`}>Все работы →</Link></div>
        {attention.length ? <div className="discipline-attention-list">{attention.slice(0, 4).map(work => <Link href={targetHref(work.target)} key={work.workId} className="discipline-attention-item" prefetch={false}><span className="discipline-inline-icon"><FileText /></span><span className="discipline-attention-copy"><strong>{work.title}</strong>{work.due && <small><CalendarDays size={15} /> Срок сдачи: {academicDate(work.due)}</small>}</span><WorkStatusBadge progress={work.progress} publishedResult={work.publishedResult} /></Link>)}</div> : detail.worksState.nextCursor
          ? <p className="discipline-empty">В показанных работах нет заданий, требующих действий. Остальные доступны в полном списке.</p>
          : <SectionEmpty state={detail.worksState} empty="Нет работ, по которым сейчас нужны действия." />}
      </section>
      <div className="discipline-side-stack"><section className="discipline-panel discipline-recent"><div className="discipline-panel-head"><h2>Последние результаты</h2><Link href={`${base}?tab=performance`}>Подробнее →</Link></div>
        {recent.length ? <div className="discipline-recent-list">{recent.map(work => <Link key={work.workId} href={targetHref(work.target)} prefetch={false}><span className="discipline-inline-icon"><CheckCircle2 /></span><span>{work.title}</span><strong>{workResult(work, detail.results.components)}</strong></Link>)}</div> : detail.worksState.nextCursor
          ? <p className="discipline-empty">Опубликованные результаты по остальным работам доступны во вкладке «Результаты».</p>
          : <SectionEmpty state={detail.worksState} empty="Опубликованных результатов пока нет." />}
      </section><AttendancePreview items={detail.sessions} complete={detail.sessionsState.isComplete} base={base} /></div>
    </div>
    <section className="discipline-material-section"><div className="discipline-panel-head"><h2>Материалы по дисциплине</h2><Link href={`${base}?tab=materials`}>Все материалы →</Link></div>{detail.materials.length ? <DisciplineMaterials items={detail.materials.slice(0, 3)} /> : <SectionEmpty state={detail.materialsState} empty="Материалы пока не опубликованы" />}</section>
  </div>;
}

function WorkResultCard({ work }: { work: WorkSummary }) {
  const result = work.publishedResult;
  return <article className="discipline-result-card">
    <div className="work-card-top"><span className="status-tag">{work.workTypeLabel}</span><WorkStatusBadge progress={work.progress} publishedResult={result} /></div>
    <h3><Link href={targetHref(work.target)} prefetch={false}>{work.title}</Link></h3>
    {work.due && <p className="discipline-card-due">Срок сдачи: {academicDate(work.due)}</p>}
    {result && <div className="discipline-result-value"><span>Результат</span><strong>{assessmentValue(result.value)}</strong></div>}
  </article>;
}

function PublishedResults({ apiBase }: { apiBase: string }) {
  return <div className="discipline-journal">
    <PagedList path={`${apiBase}/works?limit=20&filter=RESULT`} schema={WorkListResponseSchema} empty="Опубликованных результатов пока нет." renderItem={work => <WorkResultCard key={work.workId} work={work} />} />
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
      <PublishedResults key={apiBase} apiBase={apiBase} />
      {components.some(c => !c.linkedWorkId) && <div className="discipline-other-results"><h3>Другие показатели</h3>{components.filter(c => !c.linkedWorkId).map(c => <div className="discipline-unlinked-result" key={c.componentId}><span>{c.label}</span><strong>{c.value ? assessmentValue(c.value) : dataStateText(c.state)}</strong></div>)}</div>}
    </section>
    <section className="discipline-panel discipline-attendance-panel" id="attendance"><div className="discipline-panel-head"><h2>Посещаемость</h2></div><p className="discipline-hint">Отсутствие отметки не означает пропуск занятия.</p>
      <div className="discipline-attendance-table" role="table" aria-label="Посещаемость по занятиям">
        <PagedList path={`${apiBase}/sessions?limit=20`} schema={SessionListResponseSchema} empty="Занятия пока не указаны." listClassName="discipline-attendance-table-body" listRole="rowgroup" renderSummary={data => <><div role="rowgroup"><div className="discipline-attendance-table-head" role="row"><span role="columnheader">Дата</span><span role="columnheader">Занятие</span><span role="columnheader">Статус</span></div></div><div className="discipline-attendance-summary-row" role="row"><span role="cell">{attendanceSummary(data)}</span></div></>} renderItem={item => {
          const status = item.attendance?.status;
          const statusClass = status === "PRESENT" ? "is-present" : status === "ABSENT" ? "is-absent" : status === "OTHER_RECORDED" ? "is-other" : item.attendanceState === "SOURCE_ERROR" ? "is-unavailable" : "is-unmarked";
          const statusLabel = item.attendance?.statusLabel ?? (item.attendanceState === "SOURCE_ERROR" ? "Нет данных" : "Нет отметки");
          return <div className="discipline-attendance-table-row" role="row" key={item.schedule.scheduleId}>
            <span role="cell">{item.schedule.plannedStart && item.schedule.timeZone ? academicDate({ precision: "DATE_TIME", at: item.schedule.plannedStart, timeZone: item.schedule.timeZone }) : "Дата не указана"}</span>
            <span role="cell" className="discipline-attendance-lesson"><strong>{item.schedule.title}</strong><small>{item.actual?.topic && item.actual.topic !== item.schedule.title ? item.actual.topic : item.schedule.lessonType ?? "Занятие"}</small></span>
            <span role="cell"><span className={`attendance-status ${statusClass}`}>{statusLabel}</span></span>
          </div>;
        }} />
      </div>
    </section>
    <section className="discipline-panel" id="attestation"><div className="discipline-panel-head"><h2>Аттестация и официальный итог</h2></div><div className="discipline-attestation-grid"><div><span className="discipline-inline-icon"><GraduationCap /></span><h3>Аттестация</h3>{detail.results.attestations.length ? detail.results.attestations.map(a => <p key={a.attestationId}>{a.kindLabel}{a.planned ? ` · ${academicDate(a.planned)}` : " · Дата не указана"}{a.location ? ` · ${a.location}` : ""}</p>) : <p>{dataStateText(detail.results.attestationsState.dataState)}</p>}</div><div><span className="discipline-inline-icon"><BookOpen /></span><h3>Официальный итог</h3><p>{detail.results.officialResult?.value ? assessmentValue(detail.results.officialResult.value) : dataStateText(detail.results.officialResultState)}</p></div></div></section>
  </div>;
}
