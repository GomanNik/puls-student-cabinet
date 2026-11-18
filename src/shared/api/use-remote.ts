"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore, type SetStateAction } from "react";
import type { z } from "zod";
import { useRemoteCache, type Remote } from "./remote-cache";
export type { Remote } from "./remote-cache";
const loading: Remote<never> = { kind: "loading" };

export function useRemote<T>(path: string | null, schema: z.ZodType<T>, allPages = false) {
  const cache = useRemoteCache();
  const entry = useMemo(() => path ? cache.entry(path, schema, allPages) : null, [cache, path, schema, allPages]);
  const subscribe = useCallback((listener: () => void) => entry ? cache.watch(entry, listener) : () => {}, [cache, entry]);
  const snapshot = useCallback(() => (entry?.state ?? loading) as Remote<T>, [entry]);
  const state = useSyncExternalStore(subscribe, snapshot, () => loading);
  useEffect(() => { if (entry) void cache.ensure(entry); }, [cache, entry]);
  const reload = useCallback(async () => { if (entry) await cache.reload(entry); }, [cache, entry]);
  const version = entry?.version;
  const isCurrent = () => !!entry && entry.version === version;
  const setState = (next: SetStateAction<Remote<T>>) => {
    if (!entry || !isCurrent()) return;
    cache.replace(entry, version!, typeof next === "function" ? next(entry.state as Remote<T>) : next);
  };
  return { state, reload, setState, isCurrent, revision: version };
}
