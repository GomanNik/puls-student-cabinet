import Link from "next/link";
import type { AcademicDate, AssessmentValue, DataState, Material, Target, WorkProgress } from "@/shared/contracts/student-api";
import { formatDay, formatTime, localDay } from "@/shared/lib/dates";
import { materialFormat } from "@/shared/lib/material-format";
export function academicDate(date?: AcademicDate) {
  if (!date) return "Не указана";
  return date.precision === "DATE_ONLY" && date.on ? formatDay(date.on) : date.at && date.timeZone ? `${formatDay(localDay(date.at, date.timeZone))}, ${formatTime(date.at, date.timeZone)}` : "Не указана";
}
export function assessmentValue(value?: AssessmentValue) { return value?.rawValueText ?? value?.numeric ?? value?.text ?? value?.code ?? "Не указано"; }
export function dataStateText(state: DataState) { return ({ UNKNOWN: "Сведения не указаны", PENDING: "Ожидается", NOT_APPLICABLE: "Не предусмотрено источником", SOURCE_ERROR: "Источник недоступен", FORBIDDEN: "Доступ закрыт", KNOWN_ZERO: "Подтверждённый ноль", READY: "Сведения получены", EMPTY_CONFIRMED: "Подтверждённых записей нет" })[state]; }
export function targetHref(target: Target) {
  if (target.kind === "REQUEST") return `/requests/${target.targetRef}`;
  if (target.kind === "APPEAL") return `/appeals/${target.targetRef}`;
  if (target.kind === "ANNOUNCEMENT") return `/announcements/${target.targetRef}`;
  if (target.kind === "SCHEDULE") return `/schedule/${target.targetRef}`;
  if (target.kind === "MATERIAL") return `/materials/${target.targetRef}`;
  return `/open/${target.targetRef}?kind=${target.kind}`;
}
export function MaterialCards({ items }: { items: Material[] }) { return <div className="material-grid">{items.map(m => <article key={m.materialId} className="surface material-card"><h3><Link href={`/materials/${m.materialId}`} prefetch={false}>{m.title}</Link></h3><p className="small muted">{m.kind === "FILE" ? `Файл · ${materialFormat(m)}` : "Внешняя ссылка"}{m.sizeBytes != null ? ` · ${m.sizeBytes} байт` : ""}</p>{m.kind === "FILE" ? <a className="text-link" href={`/api/v1/materials/${m.materialId}/download`}>Скачать</a> : m.safeExternalUrl && <a className="text-link" href={m.safeExternalUrl} target="_blank" rel="noopener noreferrer">Открыть внешний ресурс ↗</a>}</article>)}</div>; }
export function ProgressFacts({ progress }: { progress: WorkProgress }) {
  return <dl className="data-list">{[["Назначение", progress.assignmentStatusCode], ["Выполнение", progress.completionStatusCode], ["Передача на проверку", progress.submissionStatusCode], ["Проверка", progress.reviewStatusCode]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? (progress.dataState === "SOURCE_ERROR" ? "Источник недоступен" : "Не указано")}</dd></div>)}</dl>;
}
