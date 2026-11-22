"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarSearch, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { z } from "zod";
import { useRemote } from "@/shared/api/use-remote";
import { profileResponseSchema } from "@/shared/contracts/auth";
import { ScheduleListResponseSchema, type ScheduleEntry } from "@/shared/contracts/student-api";
import { addDays, formatDay, formatTime, localDay, weekStart } from "@/shared/lib/dates";
import { Button } from "@/shared/ui/button";
import { PageHero } from "@/shared/ui/page-hero";
import { RemoteState } from "@/shared/ui/remote-state";
import { ScheduleDetailPanel } from "@/modules/schedule/detail-panel";
import { currentSelection, scheduleContextLabel, type ScheduleMode } from "@/modules/schedule/selection";

const dayName = (day: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "long" }).format(new Date(`${day}T12:00:00Z`));
const compactDate = (day: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00Z`));
const normalize = (value: string) => value.trim().toLocaleLowerCase("ru-RU");

function Lesson({ entry, href }: { entry: ScheduleEntry; href: string }) {
  const start = entry.plannedStart && entry.timeZone ? formatTime(entry.plannedStart, entry.timeZone) : "—";
  const end = entry.plannedEnd && entry.timeZone ? formatTime(entry.plannedEnd, entry.timeZone) : "Время не указано";
  return <Link id={`lesson-${entry.scheduleId}`} className={`agenda-lesson${entry.status === "CANCELLED" ? " agenda-lesson-cancelled" : ""}`} href={href} prefetch={false}>
    <span className="agenda-lesson-time"><strong>{start}</strong><small>{end}</small></span>
    <span className="agenda-lesson-copy"><strong>{entry.title}</strong><span className="agenda-lesson-tags">
      <i>{entry.lessonType ?? "Тип не указан"}</i>
      <i>{entry.subgroupLabel ?? "Вся группа"}</i>
      {entry.status === "RESCHEDULED" && <i>Перенесено</i>}
      {entry.status === "CANCELLED" && <i>Отменено</i>}
    </span></span>
    <span className="agenda-lesson-meta"><strong>{entry.room ? `Ауд. ${entry.room}` : "Аудитория не указана"}</strong><span>{entry.teacherLabel ?? "Преподаватель не указан"}</span></span>
    <ChevronRight className="agenda-lesson-arrow" size={17} aria-hidden="true" />
  </Link>;
}

function ScheduleData({ from, to, today, navigate, open }: { from: string; to: string; today: string; navigate: (day: string) => void; open: (id: string) => string }) {
  const [mode, setMode] = useState<ScheduleMode>("group");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [ownGroup, setOwnGroup] = useState(true);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const path = `/schedule?from=${from}&to=${to}&limit=20`;
  const { state, reload } = useRemote(path, ScheduleListResponseSchema, true);
  const { state: profileState, reload: reloadProfile } = useRemote("/profile", profileResponseSchema);
  const group = profileState.kind === "ready" ? profileState.value.data.group : null;
  const selection = currentSelection(mode, selected, ownGroup, group);

  const schedule = state.kind === "ready" ? state.value : null;
  const lessons = schedule?.data.items ?? [];
  const teachers = [...new Set(lessons.map(item => item.teacherLabel).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ru"));
  const rooms = [...new Set(lessons.map(item => item.room).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ru"));
  const labels = { group: "Группа", teacher: "Преподаватель", room: "Аудитория" };
  const choices = mode === "group" ? (group ? [group] : []) : mode === "teacher" ? teachers : rooms;
  const search = normalize(query);
  const suggestions = choices.filter(value => normalize(value).includes(search)).slice(0, 8);
  const filtered = selection ? lessons.filter(item => selection.mode === "group" ? selection.value === group : selection.mode === "teacher" ? item.teacherLabel === selection.value : item.room === selection.value) : [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const reset = () => { setQuery(""); setSelected(null); setOwnGroup(false); setSuggestionsOpen(false); };
  const returnToGroup = () => { setMode("group"); setQuery(""); setSelected(null); setOwnGroup(true); setSuggestionsOpen(false); };

  return <>
    <section className="agenda-toolbar" aria-label="Управление расписанием">
      <div className="agenda-week-control" aria-label="Переключение недель"><span className="agenda-week-label">Неделя</span><button type="button" onClick={() => navigate(addDays(from, -7))} aria-label="Предыдущая неделя"><ChevronLeft size={20} /></button><strong>{compactDate(from)} — {formatDay(to)}</strong><button type="button" onClick={() => navigate(addDays(from, 7))} aria-label="Следующая неделя"><ChevronRight size={20} /></button><button type="button" className="agenda-current" aria-current={from === weekStart(today) ? "date" : undefined} onClick={() => navigate(today)}>Текущая неделя</button></div>
      <div className="agenda-mode" role="group" aria-label="Режим поиска">{(["group", "teacher", "room"] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); reset(); if (value === "group") setOwnGroup(true); }}>{labels[value]}</button>)}</div>
      <div className="agenda-search-wrap" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSuggestionsOpen(false); }}>
        <label className="agenda-search"><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); setOwnGroup(false); setSuggestionsOpen(true); }} onFocus={() => setSuggestionsOpen(true)} placeholder={mode === "group" ? "Введите номер группы" : mode === "teacher" ? "Введите фамилию преподавателя" : "Введите номер аудитории"} aria-label={`Поиск: ${labels[mode].toLowerCase()}`} />{(query || selection) && <button type="button" onClick={reset} aria-label="Очистить поиск">×</button>}</label>
        {suggestionsOpen && search && !selected && <div className="agenda-suggestions" aria-label="Варианты поиска">{state.kind === "loading" || (mode === "group" && profileState.kind === "loading") ? <p>Загружаем варианты…</p> : state.kind === "error" || (mode === "group" && profileState.kind === "error") ? <p>Не удалось получить варианты поиска</p> : suggestions.length ? suggestions.map(value => <button type="button" key={value} onMouseDown={event => event.preventDefault()} onClick={() => { setQuery(value); setSelected(value); setSuggestionsOpen(false); }}><small>{labels[mode]}</small><strong>{value}</strong><span>›</span></button>) : <p>Совпадений среди доступных занятий нет</p>}</div>}
      </div>
    </section>
    {state.kind === "error" ? <RemoteState state={state} retry={reload} /> : profileState.kind !== "ready" ? <RemoteState state={profileState} retry={reloadProfile} /> : !selection ? <section className="agenda-empty-selection" aria-label="Расписание не выбрано"><span className="agenda-empty-icon" aria-hidden="true"><CalendarSearch size={112} strokeWidth={1.35} /></span><h2>Выберите группу, преподавателя или аудиторию</h2><p>Расписание появится после выбора параметра</p>{group && <button type="button" className="button button-secondary" onClick={returnToGroup}>Вернуться к расписанию своей группы</button>}</section> : state.kind === "loading" ? <RemoteState state={state} retry={reload} /> : <>
      {schedule?.meta.sourceStatus === "PARTIAL" && <div className="notice notice-warning" role="status"><strong>Показаны подтверждённые сведения</strong><p>{schedule.meta.partialErrors?.some(e => e.dataset === "CONTEXT") ? "Не удалось однозначно определить официальную подгруппу для части дисциплин. Для них показаны только занятия всей группы." : "Часть сведений или история изменений недоступна. Пустой список не подтверждает отсутствие занятий."}</p></div>}
      <p className="agenda-context" role="status"><CalendarSearch size={20} aria-hidden="true" /><strong>{scheduleContextLabel(selection)}</strong></p>
      <section className="agenda-panel" aria-labelledby="agenda-title"><header className="agenda-panel-head"><div><span className="page-hero-eyebrow">НЕДЕЛЬНЫЙ ПЛАН</span><h2 id="agenda-title">Занятия недели</h2></div><span className="agenda-count">{schedule?.data.isComplete ? `${filtered.filter(item => item.status !== "CANCELLED").length} занятий` : `Показано ${filtered.filter(item => item.status !== "CANCELLED").length} занятий`}{filtered.some(item => item.status === "CANCELLED") && `, отменено ${filtered.filter(item => item.status === "CANCELLED").length}`}</span></header>
        {days.map(day => {
          const items = filtered.filter(item => item.plannedStart && item.timeZone && localDay(item.plannedStart, item.timeZone) === day);
          return <section key={day} id={`day-${day}`} className="agenda-day" aria-labelledby={`day-title-${day}`}><header className="agenda-day-head"><span className="agenda-day-badge">{new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" }).format(new Date(`${day}T12:00:00Z`)).toUpperCase()}</span><div><h3 id={`day-title-${day}`}>{dayName(day)}</h3><small>{compactDate(day)}</small></div></header><div className="agenda-day-items">{items.length ? items.map(item => <Lesson key={item.scheduleId} entry={item} href={open(item.scheduleId)} />) : <p className="agenda-empty-day">{schedule?.data.isComplete ? "В этот день занятий нет" : "Нет подтверждённых занятий; сведения могут быть неполными"}</p>}</div></section>;
        })}
      </section>
    </>}
  </>;
}

export function ScheduleScreen({ today }: { today: string }) {
  const params = useSearchParams(), router = useRouter(), dialog = useRef<HTMLDialogElement>(null), lastOpened = useRef<string | null>(null);
  const parsed = z.string().date().safeParse(params.get("date"));
  const date = parsed.success ? parsed.data : today;
  const from = weekStart(date), to = addDays(from, 6);
  const entry = params.get("entry"), base = `/schedule?date=${date}`;
  const navigate = (nextDate: string) => router.push(`/schedule?date=${nextDate}`, { scroll: false });
  function close() { router.replace(base, { scroll: false }); }
  useEffect(() => {
    if (entry) { lastOpened.current = entry; if (!dialog.current?.open) dialog.current?.showModal(); }
    else { dialog.current?.close(); if (lastOpened.current) (document.getElementById(`lesson-${lastOpened.current}`) ?? document.querySelector<HTMLInputElement>(".agenda-search input"))?.focus(); }
  }, [entry]);
  return <main id="main" className="workspace schedule-r9-main">

    <PageHero eyebrow="УЧЕБНЫЙ ПРОЦЕСС" title="Расписание" description="Просматривайте время занятий, аудитории и преподавателей на выбранную неделю" image="schedule-week.jpg" />
    <ScheduleData from={from} to={to} today={today} navigate={navigate} open={id => `${base}&entry=${encodeURIComponent(id)}`} />
    <dialog ref={dialog} className="detail-dialog" aria-labelledby="lesson-dialog-title" onCancel={event => { event.preventDefault(); close(); }}><div className="panel-heading"><h2 id="lesson-dialog-title">Занятие</h2><Button variant="quiet" aria-label="Закрыть подробность занятия" onClick={close}><X /></Button></div>{entry && <ScheduleDetailPanel key={entry} scheduleId={entry} />}</dialog>
  </main>;
}
