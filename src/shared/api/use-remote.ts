"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { api, ApiError, safeClientMessage } from "./client";
import { RequestGeneration } from "./request-generation";

export type Remote<T> = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: T };
// Адаптация OGE usePagedRead: отмена запроса и защита от запоздавшей страницы.
export function useRemote<T>(path: string | null, schema: z.ZodType<T>) {
  const [state, setState] = useState<Remote<T>>({ kind: "loading" });
  const generation = useRef(new RequestGeneration());
  const reload = useCallback(async () => {
    const request = generation.current.next();
    setState({ kind: "loading" });
    if (!path) return;
    try {
      const value = await api(path, schema, { signal: request.signal });
      if (request.isCurrent()) setState({ kind: "ready", value });
    } catch (error) {
      if (!request.isCurrent()) return;
      if (error instanceof ApiError && error.status === 401) { location.replace("/login?reason=expired"); return; }
      setState({ kind: "error", message: error instanceof ApiError && error.status === 404 ? "Запись не найдена или больше недоступна." : safeClientMessage(error) });
    }
  }, [path, schema]);
  useEffect(() => { void reload(); const current = generation.current; return () => current.invalidate(); }, [reload]);
  return { state, reload, setState };
}
