"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRemote } from "@/shared/api/use-remote";
import { RemoteState } from "@/shared/ui/remote-state";
import { CalendarListResponseSchema, type CalendarItem } from "@/shared/contracts/student-api";
import { addDays, formatDay, localDay, weekStart } from "@/shared/lib/dates";
import { academicDate, targetHref } from "@/shared/ui/academic";

const day = (item: CalendarItem, end = false) => {
  const date = end ? item.ends ?? item.starts : item.starts;
  return date.on ?? localDay(date.at!, date.timeZone!);
};
export function monthBounds(on: string, offset = 0) {
  const date = new Date(`${on.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const from = date.toISOString().slice(0, 10);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { from, to: addDays(date.toISOString().slice(0, 10), -1) };
}
export function CalendarMonth({ query, from, to, today }: { query: string; from: string; to: string; today: string }) {
  const { state, reload } = useRemote(`/calendar?${query}&limit=100`, CalendarListResponseSchema, true);
  const items = state.kind === "ready" ? state.value.data.items : [];
  const complete = state.kind === "ready" && state.value.meta.completeness === true;
  const loading = state.kind === "loading";
  const [selected, setSelected] = useState(from <= today && to >= today ? today : from);
  const [narrow, setNarrow] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 308));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const first = weekStart(`${from.slice(0, 7)}-01`);
  const bounds = monthBounds(from);
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index));
  const matches = (on: string) => items.filter(item => day(item) <= on && day(item, true) >= on);
  const shown = narrow ? items : matches(selected);
  return <div ref={container} className="calendar-mode-month" aria-busy={loading}>
    {state.kind !== "ready" && <RemoteState state={state} retry={reload} />}
    {!loading && !complete && state.kind !== "error" && <p className="notice notice-warning">Часть источников недоступна. Количество событий не подтверждено.</p>}
    <div className="calendar-r9-workspace">
      {narrow ? <p className="notice">События выбранного периода показаны списком.</p> : <div className="calendar-r9-grid">
        <div className="calendar-weekdays" aria-hidden="true">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(label => <span key={label}>{label}</span>)}</div>
        <div className="calendar-month" aria-label="Дни месяца">{days.map(on => {
          const outside = on < bounds.from || on > bounds.to;
          const entries = outside ? [] : matches(on);
          return <button type="button" key={on} disabled={outside || loading} className={`calendar-day ${outside ? "calendar-day-outside" : ""} ${on === selected ? "calendar-day-selected" : ""}`} aria-pressed={on === selected} aria-label={`${formatDay(on)}${complete && !outside ? `, событий: ${entries.length}` : ""}`} onClick={() => setSelected(on)}>
            <time dateTime={on}>{Number(on.slice(-2))}</time>
            <span className="calendar-desktop-titles">{entries.slice(0, 2).map(item => <span key={item.eventKey}>{item.title}</span>)}{complete && entries.length > 2 && <span>Ещё {entries.length - 2}</span>}</span>
            {complete && entries.length > 0 && <span className="calendar-mobile-count" aria-hidden="true">{entries.length}</span>}
          </button>;
        })}</div>
      </div>}
      {!loading && state.kind !== "error" && <aside className="selected-day"><span className="page-hero-eyebrow">{narrow ? "СОБЫТИЯ ПЕРИОДА" : "ВЫБРАННЫЙ ДЕНЬ"}</span><h2>{narrow ? "События выбранного периода" : formatDay(selected, true)}</h2><span className="calendar-r9-selected-count">{complete ? `${shown.length} записей` : `Показано ${shown.length} записей`}</span><div className="record-list">{shown.map(item => <article className="record-card" key={item.eventKey}><p className="eyebrow">{item.origin === "UNIVERSITY_EVENT" ? "Событие университета" : item.origin === "ATTESTATION" ? "Аттестация" : "Учебный срок"}</p><h3><Link href={item.target ? targetHref(item.target) : `/calendar/events/${item.eventKey}?on=${day(item)}`}>{item.title}</Link></h3><p>{academicDate(item.starts)}{item.ends ? ` — ${academicDate(item.ends)}` : ""}</p>{item.location && <p>{item.location}</p>}</article>)}</div>{!shown.length && <p className="notice">{complete ? narrow ? "В выбранном периоде подтверждённых событий нет." : "В этот день подтверждённых событий нет." : "События не получены; отсутствие событий не подтверждено."}</p>}<div className="calendar-r9-context"><span className="page-hero-eyebrow">О КАЛЕНДАРЕ</span><p>Выберите дату в сетке, чтобы увидеть записи этого дня. Режим «Список» показывает события выбранного периода по порядку дат.</p></div></aside>}
    </div>
  </div>;
}
