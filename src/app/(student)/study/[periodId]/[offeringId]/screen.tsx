"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, safeClientMessage } from "@/shared/api/client";
import { useRemote } from "@/shared/api/use-remote";
import { OfferingListResponseSchema, SessionListResponseSchema, type OfferingSummary } from "@/shared/contracts/student-api";
import { Button } from "@/shared/ui/button";
import { ScheduleCard } from "@/shared/ui/schedule-card";
import { RemoteState } from "@/shared/ui/remote-state";
import { formatDay, localDay } from "@/shared/lib/dates";

export function OfferingSessionsScreen({ periodId, offeringId }: { periodId: string; offeringId: string }) {
  const path = `/periods/${encodeURIComponent(periodId)}/offerings/${encodeURIComponent(offeringId)}/sessions?limit=20`;
  const { state, reload, setState } = useRemote(path, SessionListResponseSchema);
  const [offering, setOffering] = useState<OfferingSummary | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function title() {
      let cursor: string | null = null;
      do {
        const page = await api(`/periods/${encodeURIComponent(periodId)}/offerings?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, OfferingListResponseSchema, { signal: controller.signal });
        const item = page.data.items.find(o => o.offeringId === offeringId);
        if (item) { if (!controller.signal.aborted) setOffering(item); return; }
        cursor = page.data.nextCursor;
      } while (cursor && !controller.signal.aborted);
    }
    void title().catch(() => {});
    return () => { controller.abort(); pending.current?.abort(); };
  }, [periodId, offeringId]);
  async function more() {
    if (state.kind !== "ready" || !state.value.data.nextCursor || busy) return;
    const previous = state.value, controller = new AbortController(); pending.current = controller; setBusy(true); setError(null);
    try {
      const page = await api(`${path}&cursor=${encodeURIComponent(previous.data.nextCursor!)}`, SessionListResponseSchema, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ kind: "ready", value: { ...page, data: { ...page.data, items: [...previous.data.items, ...page.data.items] } } });
    } catch (error) { if (!controller.signal.aborted) setError(safeClientMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <main id="main" className="workspace"><Link href={`/study?period=${encodeURIComponent(periodId)}`}>← Дисциплины семестра</Link><div className="page-heading"><div><h1>{offering?.title ?? "Занятия дисциплины"}</h1><p className="muted">{offering?.subgroup.label ?? "Официальные занятия, проведение и персональная посещаемость"}</p></div></div><div className="notice notice-info">План, факт проведения и отметка посещаемости показаны отдельно. Отсутствие отметки не означает пропуск.</div>
    {state.kind !== "ready" ? <RemoteState state={state} retry={reload} /> : <>{state.value.meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning">Часть учебных сведений недоступна. Показаны только подтверждённые данные, процент посещаемости не вычисляется.</p>}<div className="session-list">{state.value.data.items.map(item => <section key={item.schedule.scheduleId} className="session-facts"><p className="session-day">{item.schedule.plannedStart && item.schedule.timeZone ? formatDay(localDay(item.schedule.plannedStart, item.schedule.timeZone), true) : "Дата не указана"}</p><ScheduleCard entry={item.schedule} href={`/schedule/${item.schedule.scheduleId}`} /><dl className="session-facts-row"><div><dt>Проведение</dt><dd>{item.actual ? item.actual.held ? "Подтверждено" : "Не проведено по данным источника" : item.actualState === "SOURCE_ERROR" ? "Источник недоступен" : "Нет подтверждённых сведений"}</dd></div><div><dt>Ваша посещаемость</dt><dd>{item.attendance?.statusLabel ?? (item.attendanceState === "SOURCE_ERROR" ? "Источник недоступен" : "Не указано")}</dd></div></dl></section>)}</div>{!state.value.data.items.length && <p className="notice">{state.value.data.isComplete ? "В этом семестре нет подтверждённых занятий." : "Нет подтверждённых занятий; сведения могут быть неполными."}</p>}{error && <p role="alert" className="notice notice-warning">{error} Уже загруженные записи сохранены.</p>}{state.value.data.nextCursor && <Button variant="secondary" onClick={more} disabled={busy}>{busy ? "Загружаем…" : "Показать ещё"}</Button>}</>}
  </main>;
}
