"use client";
import Link from "next/link";
import { MapPin, UsersRound } from "lucide-react";
import type { ScheduleEntry } from "@/shared/contracts/student-api";
import { formatTime } from "@/shared/lib/dates";

const statuses = { PLANNED: "По расписанию", RESCHEDULED: "Перенесено", CANCELLED: "Отменено" };
export function ScheduleCard({ entry, href, overlap = false }: { entry: ScheduleEntry; href: string; overlap?: boolean }) {
  const time = entry.plannedStart && entry.timeZone ? `${formatTime(entry.plannedStart, entry.timeZone)}${entry.plannedEnd ? `–${formatTime(entry.plannedEnd, entry.timeZone)}` : ""}` : "Время не указано";
  return <Link id={`lesson-${entry.scheduleId}`} className={`schedule-card ${entry.status === "CANCELLED" ? "cancelled" : ""}`} href={href} prefetch={false}>
    <span className="lesson-time">{time}</span><div className="lesson-content"><div className="lesson-tags"><span className={`status-tag status-${entry.status.toLowerCase()}`}>{statuses[entry.status]}</span>{overlap && <span className="status-tag">Время пересекается</span>}</div><h3>{entry.title}</h3><p>{entry.lessonType ?? "Вид занятия не указан"}</p><p className="muted small"><MapPin size={15} aria-hidden="true" />{entry.room ? `Аудитория ${entry.room}` : "Аудитория не указана"}</p><p className="muted small"><UsersRound size={15} aria-hidden="true" />{entry.subgroupLabel ?? "Для всей группы"}</p>{entry.teacherLabel && <p className="muted small">{entry.teacherLabel}</p>}</div>
  </Link>;
}
