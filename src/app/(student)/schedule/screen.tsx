"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { z } from "zod";
import { api, safeClientMessage } from "@/shared/api/client";
import { useRemote } from "@/shared/api/use-remote";
import { ScheduleListResponseSchema, type ScheduleEntry } from "@/shared/contracts/student-api";
import { addDays, formatDay, localDay, weekStart } from "@/shared/lib/dates";
import { Button } from "@/shared/ui/button";
import { RemoteState } from "@/shared/ui/remote-state";
import { ScheduleCard } from "@/shared/ui/schedule-card";
import { ScheduleDetailPanel } from "@/modules/schedule/detail-panel";

function ScheduleData({ from, to, view, open }: { from: string; to: string; view: string; open: (id: string) => string }) {
  const path = `/schedule?from=${from}&to=${to}&limit=100`;
  const { state, reload, setState } = useRemote(path, ScheduleListResponseSchema);
  const [moreError, setMoreError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const { data, meta } = state.value;
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, i) => addDays(from, i));
  function overlapping(entry: ScheduleEntry, items: ScheduleEntry[]) {
    if (!entry.plannedStart || !entry.plannedEnd || entry.status === "CANCELLED") return false;
    return items.some(other => other.scheduleId !== entry.scheduleId && other.status !== "CANCELLED" && other.plannedStart && other.plannedEnd && Date.parse(entry.plannedStart!) < Date.parse(other.plannedEnd) && Date.parse(other.plannedStart) < Date.parse(entry.plannedEnd!));
  }
  async function more() {
    if (!data.nextCursor || busy) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setMoreError(null);
    try {
      const next = await api(`${path}&cursor=${encodeURIComponent(data.nextCursor)}`, ScheduleListResponseSchema, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ kind: "ready", value: { ...next, data: { ...next.data, items: [...data.items, ...next.data.items] } } });
    } catch (error) { if (!controller.signal.aborted) setMoreError(safeClientMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <>
    {meta.sourceStatus === "PARTIAL" && <div className="notice notice-warning" role="status"><strong>Показаны подтверждённые сведения</strong><p>{meta.partialErrors?.some(e => e.dataset === "CONTEXT") ? "Не удалось однозначно определить официальную подгруппу для части дисциплин. Для них показаны только занятия всей группы." : "Часть сведений или история изменений недоступна. Пустой список не подтверждает отсутствие занятий."}</p></div>}
    <div className={view === "week" ? "schedule-week" : "schedule-day"}>{days.map(day => {
      const items = data.items.filter(item => item.plannedStart && item.timeZone && localDay(item.plannedStart, item.timeZone) === day);
      return <section key={day} className="schedule-date" id={`day-${day}`} aria-labelledby={`date-${day}`}><h2 id={`date-${day}`}>{formatDay(day, true)}</h2>{items.length ? <div className="lesson-list">{items.map(item => <ScheduleCard key={item.scheduleId} entry={item} href={open(item.scheduleId)} overlap={overlapping(item, items)} />)}</div> : <p className="empty-day">{data.nextCursor ? "Остальные занятия доступны в следующей порции" : data.isComplete ? "На этот день занятий нет" : "Нет подтверждённых занятий; сведения могут быть неполными"}</p>}</section>;
    })}</div>
    {moreError && <p role="alert" className="notice notice-warning">{moreError} Уже загруженные занятия сохранены.</p>}{data.nextCursor && <Button variant="secondary" onClick={more} disabled={busy}>{busy ? "Загружаем…" : "Показать ещё"}</Button>}
  </>;
}
export function ScheduleScreen({ today }: { today: string }) {
  const params = useSearchParams(), router = useRouter(), dialog = useRef<HTMLDialogElement>(null), lastOpened = useRef<string | null>(null);
  const parsed = z.string().date().safeParse(params.get("date"));
  const date = parsed.success ? parsed.data : today, view = params.get("view") === "week" ? "week" : "day";
  const from = view === "week" ? weekStart(date) : date, to = view === "week" ? addDays(from, 6) : from;
  const entry = params.get("entry"), base = `/schedule?date=${date}&view=${view}`;
  const navigate = (nextDate: string, nextView = view) => router.push(`/schedule?date=${nextDate}&view=${nextView}`, { scroll: false });
  function close() { router.replace(base, { scroll: false }); }
  useEffect(() => {
    if (entry) { lastOpened.current = entry; if (!dialog.current?.open) dialog.current?.showModal(); }
    else { dialog.current?.close(); if (lastOpened.current) document.getElementById(`lesson-${lastOpened.current}`)?.focus(); }
  }, [entry]);
  return <main id="main" className="workspace"><div className="page-heading"><div><p className="eyebrow">Учебная неделя</p><h1>Расписание</h1><p className="muted">Занятия вашей группы и официальных подгрупп по дисциплинам</p></div></div>
    <div className="schedule-toolbar"><div className="segmented" aria-label="Режим расписания"><button aria-pressed={view === "day"} onClick={() => navigate(date, "day")}>День</button><button aria-pressed={view === "week"} onClick={() => navigate(date, "week")}>Неделя</button></div><div className="date-navigation"><Button variant="secondary" aria-label={view === "week" ? "Предыдущая неделя" : "Предыдущий день"} onClick={() => navigate(addDays(date, view === "week" ? -7 : -1))}><ChevronLeft /></Button><Button variant="secondary" onClick={() => navigate(today)}>Сегодня</Button><Button variant="secondary" aria-label={view === "week" ? "Следующая неделя" : "Следующий день"} onClick={() => navigate(addDays(date, view === "week" ? 7 : 1))}><ChevronRight /></Button></div><label className="date-field">Дата<input type="date" value={date} onChange={event => { if (z.string().date().safeParse(event.target.value).success) navigate(event.target.value); }} /></label></div>
    <p className="range-label">{formatDay(from)}{to !== from ? ` — ${formatDay(to)}` : ""}</p>{view === "week" && <nav className="week-dates" aria-label="Перейти к дню">{Array.from({ length: 7 }, (_, i) => addDays(from, i)).map(day => <a key={day} href={`#day-${day}`} aria-current={day === today ? "date" : undefined}>{new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`))}</a>)}</nav>}
    <ScheduleData key={`${from}:${view}`} from={from} to={to} view={view} open={id => `${base}&entry=${encodeURIComponent(id)}`} />
    <dialog ref={dialog} className="detail-dialog" aria-labelledby="lesson-dialog-title" onCancel={event => { event.preventDefault(); close(); }}><div className="panel-heading"><h2 id="lesson-dialog-title">Занятие</h2><Button variant="quiet" aria-label="Закрыть подробность занятия" onClick={close}><X /></Button></div>{entry && <ScheduleDetailPanel key={entry} scheduleId={entry} />}</dialog>
  </main>;
}
