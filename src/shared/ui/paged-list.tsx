"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import { api, safeClientMessage } from "@/shared/api/client";
import { useRemote } from "@/shared/api/use-remote";
import type { DataState, ResponseMeta } from "@/shared/contracts/student-api";
import { RemoteState } from "./remote-state";
import { Button } from "./button";
type Page = { data: { items: unknown[]; nextCursor: string | null; isComplete: boolean | null; dataState: DataState }; meta: ResponseMeta };
export function PagedList<T extends Page>({ path, schema, renderItem, renderSummary, empty = "Подтверждённых записей нет.", pollWhile }: { path: string; schema: z.ZodType<T>; renderItem: (item: T["data"]["items"][number]) => ReactNode; renderSummary?: (data: T["data"]) => ReactNode; empty?: string; pollWhile?: (item: T["data"]["items"][number]) => boolean }) {
  const { state, reload, setState, isCurrent, revision } = useRemote(path, schema);
  const key = `${path}:${revision}`;
  const [pageStatus, setPageStatus] = useState<{ key: string; busy: boolean; error: string | null }>({ key, busy: false, error: null }), pending = useRef<AbortController | null>(null);
  const busy = pageStatus.key === key && pageStatus.busy, error = pageStatus.key === key ? pageStatus.error : null;
  useEffect(() => {
    pending.current?.abort(); pending.current = null;
    return () => { pending.current?.abort(); pending.current = null; };
  }, [path, revision]);
  const polling = state.kind === "ready" && state.value.data.items.some(item => pollWhile?.(item as T["data"]["items"][number]));
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, 5_000);
    return () => window.clearInterval(timer);
  }, [polling, reload]);
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const { data, meta } = state.value;
  async function next() {
    if (!data.nextCursor || busy || pending.current || state.kind !== "ready" || state.refreshing) return;
    const controller = new AbortController(); pending.current = controller; setPageStatus({ key, busy: true, error: null });
    try {
      const page = await api(`${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(data.nextCursor)}`, schema, { signal: controller.signal });
      if (!controller.signal.aborted && isCurrent()) setState({ kind: "ready", value: { ...page, data: { ...page.data, items: [...data.items, ...page.data.items] } } as T });
    } catch (error) { if (!controller.signal.aborted && isCurrent()) setPageStatus({ key, busy: false, error: safeClientMessage(error) }); }
    finally { if (pending.current === controller) { pending.current = null; if (!controller.signal.aborted) setPageStatus(current => current.key === key ? { ...current, busy: false } : current); } }
  }
  return <>{meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning" role="status">Сведения неполны. Показана только подтверждённая часть.</p>}{renderSummary?.(data)}<div className="record-list">{(data.items as Array<T["data"]["items"][number]>).map(renderItem)}</div>{!data.items.length && <p className="notice">{data.isComplete ? empty : "Сведения недоступны или неполны; отсутствие записей не подтверждено."}</p>}{error && <p className="notice notice-warning" role="alert">{error} Загруженные записи сохранены.</p>}{data.nextCursor && <Button variant="secondary" disabled={busy || state.refreshing} onClick={next}>{busy ? "Загружаем…" : "Показать ещё"}</Button>}</>;
}
