"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import { api, safeClientMessage } from "@/shared/api/client";
import { useRemote } from "@/shared/api/use-remote";
import type { DataState, ResponseMeta } from "@/shared/contracts/student-api";
import { RemoteState } from "./remote-state";
import { Button } from "./button";
type Page = { data: { items: unknown[]; nextCursor: string | null; isComplete: boolean | null; dataState: DataState }; meta: ResponseMeta };
export function PagedList<T extends Page>({ path, schema, renderItem, empty = "Подтверждённых записей нет." }: { path: string; schema: z.ZodType<T>; renderItem: (item: T["data"]["items"][number]) => ReactNode; empty?: string }) {
  const { state, reload, setState } = useRemote(path, schema), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const { data, meta } = state.value;
  async function next() {
    if (!data.nextCursor || busy) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(null);
    try {
      const page = await api(`${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(data.nextCursor)}`, schema, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ kind: "ready", value: { ...page, data: { ...page.data, items: [...data.items, ...page.data.items] } } as T });
    } catch (error) { if (!controller.signal.aborted) setError(safeClientMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <>{meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning" role="status">Сведения неполны. Показана только подтверждённая часть.</p>}<div className="record-list">{(data.items as Array<T["data"]["items"][number]>).map(renderItem)}</div>{!data.items.length && <p className="notice">{data.isComplete ? empty : "Сведения недоступны или неполны; отсутствие записей не подтверждено."}</p>}{error && <p className="notice notice-warning" role="alert">{error} Загруженные записи сохранены.</p>}{data.nextCursor && <Button variant="secondary" disabled={busy} onClick={next}>{busy ? "Загружаем…" : "Показать ещё"}</Button>}</>;
}
