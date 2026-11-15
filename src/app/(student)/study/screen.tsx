"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { api, safeClientMessage } from "@/shared/api/client";
import { useRemote } from "@/shared/api/use-remote";
import { OfferingListResponseSchema, PeriodListResponseSchema, UnitListResponseSchema } from "@/shared/contracts/student-api";
import { PagedList } from "@/shared/ui/paged-list";
import { RemoteState } from "@/shared/ui/remote-state";
import { Button } from "@/shared/ui/button";

function OfferingList({ periodId }: { periodId: string }) {
  const path = `/periods/${encodeURIComponent(periodId)}/offerings?limit=20`;
  const { state, reload, setState } = useRemote(path, OfferingListResponseSchema);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const { data, meta } = state.value;
  async function more() {
    if (!data.nextCursor || busy) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(null);
    try {
      const response = await api(`${path}&cursor=${encodeURIComponent(data.nextCursor)}`, OfferingListResponseSchema, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ kind: "ready", value: { ...response, data: { ...response.data, items: [...data.items, ...response.data.items] } } });
    } catch (error) { if (!controller.signal.aborted) setError(safeClientMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <>{meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning">Учебные сведения неполны. Неизвестное назначение подгруппы не заменяется случайным.</p>}<div className="offering-grid">{data.items.map(offering => <Link key={offering.offeringId} className="offering-card" href={`/study/${periodId}/${offering.offeringId}`} prefetch={false}><div className="card-icon"><BookOpen aria-hidden="true" /><ArrowUpRight size={18} aria-hidden="true" /></div><h2>{offering.title}</h2><p className="muted">{offering.subgroup.dataState === "READY" ? offering.subgroup.label : "Официальная подгруппа не определена"}</p><span className="text-link">Занятия и посещаемость →</span></Link>)}</div>{!data.items.length && <p className="notice">{data.isComplete ? "В этом семестре нет подтверждённых дисциплин." : "Список дисциплин неполон. Попробуйте обновить позже."}</p>}{error && <p role="alert" className="notice notice-warning">{error}</p>}{data.nextCursor && <Button variant="secondary" onClick={more} disabled={busy}>{busy ? "Загружаем…" : "Показать ещё"}</Button>}</>;
}
export function StudyScreen() {
  const { state, reload } = useRemote("/periods", PeriodListResponseSchema), router = useRouter(), params = useSearchParams();
  if (state.kind !== "ready") return <main id="main" className="workspace"><h1>Учёба</h1><RemoteState state={state} retry={reload} /></main>;
  const periods = state.value.data.items, requested = params.get("period");
  const selected = requested ? periods.find(p => p.periodId === requested) : periods.find(p => p.isCurrent) ?? periods[0];
  return <main id="main" className="workspace"><div className="page-heading"><div><p className="eyebrow">Ваше обучение</p><h1>Учёба</h1><p className="muted">Дисциплины и официальные назначения по семестрам</p></div></div><label className="select-field">Учебный период<select value={selected?.periodId ?? ""} onChange={event => router.push(`/study?period=${encodeURIComponent(event.target.value)}`)}>{!selected && <option value="">Выберите доступный период</option>}{periods.map(period => <option key={period.periodId} value={period.periodId}>{period.label}{period.isCurrent ? " · текущий" : ""}</option>)}</select></label>{selected ? <><OfferingList key={selected.periodId} periodId={selected.periodId} /><h2>Самостоятельные учебные единицы</h2><PagedList key={`units-${selected.periodId}`} path={`/periods/${selected.periodId}/academic-units?limit=20`} schema={UnitListResponseSchema} renderItem={unit => <article className="surface" key={unit.unitId}><h3><Link href={`/study/${selected.periodId}/units/${unit.unitId}`} prefetch={false}>{unit.title}</Link></h3><p className="muted">{unit.unitTypeLabel}</p></article>} /></> : <p className="notice">{requested ? "Этот учебный период недоступен." : "Подтверждённых учебных периодов пока нет."}</p>}</main>;
}
