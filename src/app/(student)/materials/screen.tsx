"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, FileText, Link2, Search } from "lucide-react";
import { api, safeClientMessage } from "@/shared/api/client";
import { useRemote } from "@/shared/api/use-remote";
import { MaterialListResponseSchema, OfferingListResponseSchema, PeriodListResponseSchema, type Material } from "@/shared/contracts/student-api";
import { Button } from "@/shared/ui/button";
import { PageHero } from "@/shared/ui/page-hero";
import { RemoteState } from "@/shared/ui/remote-state";
import { materialFormat } from "@/shared/lib/material-format";

function MaterialRow({ item }: { item: Material }) {
  const format = materialFormat(item);
  return <Link className="catalog-row" href={`/materials/${encodeURIComponent(item.materialId)}`} prefetch={false}>
    <span className={`catalog-file-symbol catalog-file-${format.toLowerCase()}`}>{item.kind === "LINK" ? <Link2 size={25} aria-hidden="true" /> : <FileText size={26} aria-hidden="true" />}<b>{format === "LINK" ? "URL" : format}</b></span>
    <span className="catalog-row-copy"><strong>{item.title}</strong><small>{item.kind === "LINK" ? "Внешний ресурс" : `Файл · ${format}`}</small></span>
    <span className="catalog-row-action">Подробнее <ArrowRight size={18} aria-hidden="true" /></span>
  </Link>;
}
function MaterialCatalog({ path }: { path: string }) {
  const { state, reload, setState, isCurrent, revision } = useRemote(path, MaterialListResponseSchema);
  const key = `${path}:${revision}`;
  const [pageStatus, setPageStatus] = useState<{ key: string; busy: boolean; error: string | null }>({ key, busy: false, error: null });
  const pending = useRef<AbortController | null>(null);
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("");
  const busy = pageStatus.key === key && pageStatus.busy;
  const error = pageStatus.key === key ? pageStatus.error : null;
  useEffect(() => {
    pending.current?.abort(); pending.current = null;
    return () => { pending.current?.abort(); pending.current = null; };
  }, [path, revision]);
  const more = useCallback(async () => {
    if (state.kind !== "ready" || busy || pending.current || state.refreshing) return;
    const { data } = state.value;
    const nextCursor = data.nextCursor;
    if (!nextCursor) return;
    const controller = new AbortController(); pending.current = controller; setPageStatus({ key, busy: true, error: null });
    try {
      const next = await api(`${path}&cursor=${encodeURIComponent(nextCursor)}`, MaterialListResponseSchema, { signal: controller.signal });
      if (!controller.signal.aborted && isCurrent()) setState({ kind: "ready", value: { ...next, data: { ...next.data, items: [...data.items, ...next.data.items] } } });
    } catch (cause) {
      if (!controller.signal.aborted && isCurrent()) setPageStatus({ key, busy: false, error: safeClientMessage(cause) });
    } finally {
      if (pending.current === controller) { pending.current = null; if (!controller.signal.aborted) setPageStatus(current => current.key === key ? { ...current, busy: false } : current); }
    }
  }, [busy, isCurrent, key, path, setState, state]);
  const searching = Boolean(search.trim() || format);
  useEffect(() => {
    if (!searching || error || state.kind !== "ready" || !state.value.data.nextCursor) return;
    const timer = window.setTimeout(() => { void more(); }, 250);
    return () => window.clearTimeout(timer);
  }, [searching, error, state, more]);
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const { data, meta } = state.value;
  const matches = data.items.filter(item => item.title.toLocaleLowerCase("ru-RU").includes(search.trim().toLocaleLowerCase("ru-RU")) && (!format || materialFormat(item) === format));
  const files = matches.filter(item => item.kind === "FILE");
  const links = matches.filter(item => item.kind === "LINK");
  const clearPageError = () => setPageStatus(current => current.key === key ? { ...current, error: null } : current);
  const reset = () => { setSearch(""); setFormat(""); clearPageError(); };
  return <>
    {meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning" role="status">Показаны доступные материалы. Сведения источника могут быть неполными.</p>}
    <div className="catalog-local-filters"><label>Поиск по названию<span><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={event => { setSearch(event.target.value); clearPageError(); }} placeholder="Название файла или ресурса" /></span></label><label>Формат<select value={format} onChange={event => { setFormat(event.target.value); clearPageError(); }}><option value="">Все форматы</option><option value="PDF">PDF</option><option value="DOCX">DOCX</option><option value="PPTX">PPTX</option><option value="XLSX">XLSX</option><option value="LINK">Ссылки</option></select></label><button type="button" onClick={reset}>Сбросить</button></div>
    <div className="catalog-head"><div><span className="page-hero-eyebrow">БИБЛИОТЕКА МАТЕРИАЛОВ</span><h2>Доступные записи</h2></div><span>{files.length} файлов · {links.length} ссылок</span></div>
    <div className="catalog-layout"><div className="catalog-primary">
      {!!files.length && <section className="catalog-group" aria-labelledby="catalog-files"><header><BookOpen size={20} aria-hidden="true" /><h3 id="catalog-files">Учебные файлы</h3><span>{files.length}</span></header><div>{files.map(item => <MaterialRow item={item} key={item.materialId} />)}</div></section>}
      {!!links.length && <section className="catalog-group" aria-labelledby="catalog-links"><header><Link2 size={20} aria-hidden="true" /><h3 id="catalog-links">Внешние ресурсы</h3><span>{links.length}</span></header><div>{links.map(item => <MaterialRow item={item} key={item.materialId} />)}</div></section>}
      {!matches.length && !(searching && data.nextCursor) && <div className="catalog-empty" role="status"><Search size={25} aria-hidden="true" /><h3>{data.items.length ? "Подходящих материалов не найдено" : data.isComplete ? "Доступных материалов пока нет" : "Сведения о материалах неполны"}</h3><p>{data.items.length ? "Измените запрос или формат файла." : "Попробуйте обновить страницу позже."}</p>{(search || format) && <button type="button" onClick={reset}>Сбросить фильтры</button>}</div>}
      {error && <p className="notice notice-warning" role="alert">{error} Уже загруженные записи сохранены.</p>}
      {searching && data.nextCursor && <p role="status" className="notice">Ищем в остальных доступных материалах…</p>}
      {data.nextCursor && <div className="catalog-more"><Button variant="secondary" onClick={more} disabled={busy || state.refreshing}>{busy ? "Загружаем…" : searching ? "Продолжить поиск" : "Показать ещё материалы"}</Button></div>}
    </div><aside className="catalog-aside"><span className="page-hero-eyebrow">О КАТАЛОГЕ</span><h3>Найдите нужный материал</h3><p>Используйте поиск по названию и фильтр по формату. Откройте запись, чтобы посмотреть файл или перейти к внешнему ресурсу.</p><div className="catalog-stats"><div><strong>{data.items.filter(item => item.kind === "FILE").length}</strong><span>учебных файлов</span></div><div><strong>{data.items.filter(item => item.kind === "LINK").length}</strong><span>внешних ресурсов</span></div></div></aside></div>
  </>;
}
export function MaterialsScreen() {
  const params = useSearchParams(), router = useRouter();
  const periods = useRemote("/periods", PeriodListResponseSchema);
  const periodId = params.get("periodId"), offeringId = params.get("offeringId"), unitId = params.get("unitId");
  const offerings = useRemote(periodId ? `/periods/${encodeURIComponent(periodId)}/offerings?limit=100` : null, OfferingListResponseSchema);
  const filter = new URLSearchParams({ limit: "20" });
  if (periodId) filter.set("periodId", periodId);
  if (offeringId) filter.set("offeringId", offeringId);
  if (unitId) filter.set("unitId", unitId);
  const path = `/materials?${filter}`;
  return <main id="main" className="workspace materials-r9-main">
    <PageHero eyebrow="УЧЕБНЫЙ КАБИНЕТ" title="Материалы" description="Учебные файлы и внешние ресурсы, доступные в личном кабинете." image="materials-library.jpg" />
    <div className="catalog-scope-filters"><label>Учебный период<select value={periodId ?? ""} onChange={event => router.push(event.target.value ? `/materials?periodId=${encodeURIComponent(event.target.value)}` : "/materials")}><option value="">Все доступные периоды</option>{periods.state.kind === "ready" && periods.state.value.data.items.map(period => <option key={period.periodId} value={period.periodId}>{period.label}</option>)}</select></label><label>Дисциплина<select value={offeringId ?? ""} disabled={!periodId || offerings.state.kind !== "ready"} onChange={event => router.push(event.target.value ? `/materials?periodId=${encodeURIComponent(periodId!)}&offeringId=${encodeURIComponent(event.target.value)}` : `/materials?periodId=${encodeURIComponent(periodId!)}`)}><option value="">Все дисциплины</option>{offerings.state.kind === "ready" && offerings.state.value.data.items.map(item => <option key={item.offeringId} value={item.offeringId}>{item.title}</option>)}</select></label></div>
    {unitId && <p className="notice notice-info">Показаны материалы выбранной самостоятельной учебной единицы. <Link href="/materials">Смотреть весь каталог</Link></p>}
    <MaterialCatalog key={path} path={path} />
  </main>;
}
