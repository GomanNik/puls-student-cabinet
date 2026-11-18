"use client";
import Link from "next/link";
import { useRemote } from "@/shared/api/use-remote";
import { MaterialListResponseSchema, ScheduleDetailResponseSchema } from "@/shared/contracts/student-api";
import { formatDay, formatTime, localDay } from "@/shared/lib/dates";
import { RemoteState } from "@/shared/ui/remote-state";
import { Button } from "@/shared/ui/button";
import { PageHero } from "@/shared/ui/page-hero";

function RelatedLessonMaterials({ scheduleId, periodId, offeringId }: { scheduleId: string; periodId: string; offeringId: string }) {
  const path = `/materials?periodId=${encodeURIComponent(periodId)}&offeringId=${encodeURIComponent(offeringId)}`;
  const { state } = useRemote(path, MaterialListResponseSchema, true);
  if (state.kind !== "ready") return null;
  const materials = state.value.data.items.filter(item => item.relatedScheduleIds?.includes(scheduleId));
  if (!materials.length) return state.value.meta.completeness === false ? <p className="notice notice-warning">Сведения о связанных материалах пока неполны.</p> : null;
  return <section className="activity-facts"><h3>Материалы занятия</h3><ul>{materials.map(item => <li key={item.materialId}><Link href={`/materials/${encodeURIComponent(item.materialId)}`}>{item.title}</Link></li>)}</ul></section>;
}

export function ScheduleDetailPanel({ scheduleId, showAttendance = false, fullPage = false }: { scheduleId: string; showAttendance?: boolean; fullPage?: boolean }) {
  const { state, reload } = useRemote(`/schedule/${encodeURIComponent(scheduleId)}`, ScheduleDetailResponseSchema);
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const { schedule, actual, attendance, actualState, attendanceState } = state.value.data;
  return <>{fullPage && <PageHero eyebrow="РАСПИСАНИЕ" title={schedule.title} description={schedule.plannedStart && schedule.timeZone ? `${formatDay(localDay(schedule.plannedStart, schedule.timeZone), true)} · ${schedule.lessonType ?? "Занятие"}` : schedule.lessonType ?? "Занятие"} image="lesson-study.jpg" />}<div className={`lesson-detail${fullPage ? " surface" : ""}`}><p className="eyebrow">Сведения о занятии</p>{!fullPage && <h2>{schedule.title}</h2>}<dl className="data-list">
    <div><dt>Дата</dt><dd>{schedule.plannedStart && schedule.timeZone ? formatDay(localDay(schedule.plannedStart, schedule.timeZone), true) : "Не указана"}</dd></div>
    <div><dt>Время</dt><dd>{schedule.plannedStart && schedule.timeZone ? `${formatTime(schedule.plannedStart, schedule.timeZone)}${schedule.plannedEnd ? `–${formatTime(schedule.plannedEnd, schedule.timeZone)}` : ""}` : "Не указано"}</dd></div>
    <div><dt>Часовой пояс</dt><dd>{schedule.timeZone ?? "Не указан"}</dd></div>
    <div><dt>Вид занятия</dt><dd>{schedule.lessonType ?? "Не указан"}</dd></div><div><dt>Аудитория</dt><dd>{schedule.room ?? "Не указана"}</dd></div>
    <div><dt>Преподаватель</dt><dd>{schedule.teacherLabel ?? "Не указан"}</dd></div><div><dt>Аудитория студентов</dt><dd>{schedule.subgroupLabel ?? "Вся группа"}</dd></div>
    <div><dt>Состояние</dt><dd>{schedule.status === "RESCHEDULED" ? "Перенесено" : schedule.status === "CANCELLED" ? "Отменено" : "По расписанию"}</dd></div>
  </dl>{schedule.change && <section className="notice notice-info"><h3>Изменение занятия</h3><p>{schedule.change.description ?? "Источник сообщил об изменении. Выше показаны актуальные сведения."}</p>{schedule.change.occurredAt && <p className="small muted">Сообщено: {new Intl.DateTimeFormat("ru-RU", { timeZone: schedule.timeZone ?? "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(schedule.change.occurredAt))}</p>}</section>}
    {showAttendance && <section className="activity-facts"><h3>Официальные факты</h3><dl className="data-list"><div><dt>Проведение</dt><dd>{actual ? actual.held ? "Проведено" : "Источник сообщил: не проведено" : actualState === "SOURCE_ERROR" ? "Источник проведения недоступен" : "Нет подтверждённых сведений"}</dd></div>{actual?.topic && <div><dt>Тема</dt><dd>{actual.topic}</dd></div>}<div><dt>Посещаемость</dt><dd>{attendance?.statusLabel ?? (attendanceState === "SOURCE_ERROR" ? "Источник посещаемости недоступен" : "Не указано")}</dd></div></dl><p className="small muted">Отсутствие отметки не означает пропуск.</p></section>}
    {fullPage && <RelatedLessonMaterials scheduleId={scheduleId} periodId={schedule.periodId} offeringId={schedule.offeringId} />}
    <Button asChild variant="secondary"><Link href={`/study/${schedule.periodId}/${schedule.offeringId}`} prefetch={false}>Открыть дисциплину</Link></Button>
  </div></>;
}
