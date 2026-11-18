"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, CalendarDays, Clock3, FileText, Layers3, MapPin, Megaphone, UserRound } from "lucide-react";
import * as C from "@/shared/contracts/student-api";
import { useRemote } from "@/shared/api/use-remote";
import { RemoteState } from "@/shared/ui/remote-state";
import { PageHero } from "@/shared/ui/page-hero";
import { useStudentDisplayName } from "@/shared/ui/student-identity";
import { academicDate, targetHref } from "@/shared/ui/academic";
import { formatDay, localDay } from "@/shared/lib/dates";

function PanelTitle({ icon: Icon, title, href, link }: {
  icon: typeof Clock3; title: string; href: string; link: string;
}) {
  return <div className="home-panel-title">
    <h2><Icon size={21} aria-hidden="true" />{title}</h2>
    <Link href={href}>{link}<ArrowRight size={18} aria-hidden="true" /></Link>
  </div>;
}

function firstName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[1] : parts[0] ?? "";
}

function lessonTime(value: string | undefined, timeZone: string | undefined) {
  if (!value || !timeZone) return null;
  try { return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
  catch { return null; }
}

function lessonDate(value: string | undefined, timeZone: string | undefined) {
  if (!value || !timeZone) return null;
  try {
    const date = new Date(value);
    const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone, ...options }).format(date);
    return { on: localDay(value, timeZone), weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }) };
  } catch { return null; }
}

function eventDay(item: C.CalendarItem) {
  return item.starts.on ?? localDay(item.starts.at!, item.starts.timeZone!);
}

function EventPreview({ item }: { item: C.CalendarItem }) {
  const on = eventDay(item);
  const href = item.target ? targetHref(item.target) : `/calendar/events/${encodeURIComponent(item.eventKey)}?on=${on}`;
  const [day, month] = formatDay(on).split(" ");
  return <Link className="home-event" href={href}>
    <time className="home-event-date" dateTime={on}><strong>{day}</strong><small>{month?.slice(0, 3) ?? ""}</small></time>
    <span className="home-event-dot" aria-hidden="true" />
    <span className="home-event-copy"><strong>{item.title}</strong><small>{academicDate(item.starts)}{item.ends ? ` — ${academicDate(item.ends)}` : ""}</small>{item.location && <small><MapPin size={13} aria-hidden="true" />{item.location}</small>}</span>
  </Link>;
}

export function DashboardScreen() {
  const { state, reload } = useRemote("/dashboard", C.DashboardResponseSchema);
  const displayName = useStudentDisplayName();
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const { data, meta } = state.value;
  const empty = meta.completeness ? "Подтверждённых записей нет." : "Сведения пока неполные. Откройте раздел для уточнения.";
  const nearest = data.nextClasses.find(item => item.status !== "CANCELLED");
  const announcement = data.announcements[0];
  const greeting = firstName(displayName);
  const date = lessonDate(nearest?.plannedStart, nearest?.timeZone);

  return <main id="main" className="content-main home-main">
    <PageHero eyebrow="ПУЛЬС / ВАШ УНИВЕРСИТЕТ" title={greeting ? `Добрый день, ${greeting}` : "Добрый день"}
      description="Ваш учебный центр, расписание, материалы и важные события — в одном месте"
      image="home-dashboard.jpg" priority className="home-hero" />
    {meta.sourceStatus === "PARTIAL" && <p role="status" className="notice notice-warning">Часть источников недоступна или неполна. Показаны только подтверждённые сведения.</p>}
    <div className="home-dashboard"><div className="home-grid home-grid-columns"><div className="home-column">
        <section className="home-next-lesson" aria-labelledby="home-lesson-title">
          <div className="home-lesson-head"><h2 id="home-lesson-title"><CalendarDays size={22} aria-hidden="true" />Ближайшее занятие</h2><Link href="/schedule">В расписании <ArrowRight size={18} aria-hidden="true" /></Link></div>
          {nearest ? <div className="home-lesson-body">
            <div className="home-lesson-date">{date ? <time dateTime={date.on}><span>{date.weekday}</span><strong>{date.day}</strong><span>{date.month}</span></time> : <span>Дата не указана</span>}</div>
            <div className="home-lesson-time"><strong>{lessonTime(nearest.plannedStart, nearest.timeZone) ?? "Время не указано"}{nearest.plannedEnd && lessonTime(nearest.plannedEnd, nearest.timeZone) ? ` – ${lessonTime(nearest.plannedEnd, nearest.timeZone)}` : ""}</strong></div>
            <div className="home-lesson-details"><h2><Link href={targetHref(nearest.target)}>{nearest.title}</Link></h2><p>{nearest.lessonType && <span><Layers3 size={15} aria-hidden="true" />{nearest.lessonType}{nearest.subgroupLabel ? ` · ${nearest.subgroupLabel}` : ""}</span>}{nearest.room && <span><MapPin size={15} aria-hidden="true" />{nearest.room}</span>}{nearest.teacherLabel && <span><UserRound size={15} aria-hidden="true" />{nearest.teacherLabel}</span>}</p>{nearest.change && <small>{nearest.change.description ?? "Расписание изменено"}</small>}</div>
          </div> : <p className="home-empty-light">{empty}</p>}
        </section>
        <section className="home-panel home-news">
          <PanelTitle icon={Megaphone} title="Новости и объявления" href="/announcements" link="Все объявления" />
          {announcement ? <Link className="home-news-feature" href={`/announcements/${encodeURIComponent(announcement.announcementId)}`}><span className="home-news-image"><Image src="/puls/home-library.jpg" fill sizes="(max-width: 640px) 100vw, 25vw" alt="" /><span>{announcement.authorLabel ?? "Объявление"}</span></span><span className="home-news-copy"><strong>{announcement.title}</strong>{announcement.body && <small>{announcement.body.slice(0, 160)}{announcement.body.length > 160 ? "…" : ""}</small>}{announcement.publishedAt && <em><CalendarDays size={14} aria-hidden="true" />{formatDay(localDay(announcement.publishedAt, "Asia/Omsk"))}</em>}</span></Link> : <p className="home-empty">{empty}</p>}
        </section>
      </div><div className="home-column">
        <section className="home-panel home-deadlines">
          <PanelTitle icon={Clock3} title="Учебные сроки" href="/study" link="К учёбе" />
          <div className="home-deadline-list">{data.upcomingDeadlines.slice(0, 3).map(item => <Link key={item.eventKey} href={item.target ? targetHref(item.target) : `/calendar/events/${encodeURIComponent(item.eventKey)}?on=${eventDay(item)}`}><span className="home-deadline-dot" aria-hidden="true"/><span><strong>{item.title}</strong><small>{item.disciplineLabel ? `${item.disciplineLabel} · ` : ""}{academicDate(item.starts)}</small></span></Link>)}{!data.upcomingDeadlines.length && <p className="home-empty">{empty}</p>}</div>
        </section>
        <section className="home-panel home-materials">
          <PanelTitle icon={Layers3} title="Учебные материалы" href="/materials" link="Все материалы" />
          <div className="home-material-list">{data.materials.filter((item, index, items) => items.findIndex(candidate => candidate.title === item.title) === index).slice(0, 2).map(item => <Link key={item.materialId} href={`/materials/${encodeURIComponent(item.materialId)}`}><FileText size={24} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.kind === "FILE" ? (item.title.match(/\.([^.]+)$/)?.[1]?.toUpperCase() ?? "Файл") : "Внешний ресурс"}</small></span><ArrowRight size={17} aria-hidden="true" /></Link>)}{!data.materials.length && <p className="home-empty">{empty}</p>}</div>
        </section>
        <section className="home-panel home-calendar">
          <PanelTitle icon={CalendarDays} title="События календаря" href="/calendar" link="В календарь" />
          <div className="home-event-list">{data.calendarHighlights.slice(0, 2).map(item => <EventPreview key={item.eventKey} item={item} />)}{!data.calendarHighlights.length && <p className="home-empty">{empty}</p>}</div>
        </section>
      </div></div></div>
    <Link className="home-assistant-fab" href="/assistant" aria-label="Открыть ИИ-помощника" title="Открыть ИИ-помощника"><Bot size={28} aria-hidden="true" /></Link>
  </main>;
}
