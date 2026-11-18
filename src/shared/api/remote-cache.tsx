"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { z } from "zod";
import { api, ApiError, expireClientSession, safeClientMessage } from "./client";

export type Remote<T> = { kind: "loading" } | { kind: "error"; message: string }
  | { kind: "ready"; value: T; refreshing?: boolean; refreshError?: string };
const loading: Remote<never> = { kind: "loading" };
// Частые переключения вкладок не должны вызывать повторные запросы.
// Данные остаются в памяти активной сессии и показываются сразу при возврате.
const FRESH_MS = 2 * 60_000, RETAIN_MS = 15 * 60_000, LIMIT = 80;
type Page = { data: { items: unknown[]; nextCursor: string | null; isComplete: boolean | null }; meta: { completeness?: boolean | null } };
export type CacheEntry = {
  path: string; schema: z.ZodType<unknown>; allPages: boolean; state: Remote<unknown>;
  version: number; loadedAt: number; attemptedAt: number; touchedAt: number; stale: boolean;
  listeners: Set<() => void>; controller?: AbortController; pending?: Promise<void>;
};

function uniqueItems(items: unknown[]) {
  const entries = new Map<unknown, unknown>();
  for (const item of items) {
    const record = item as Record<string, unknown> | null;
    const id = record && (record.id ?? record.messageId ?? record.notificationKey ?? record.eventKey
      ?? record.scheduleId ?? record.materialId ?? record.workId ?? record.timelineKey
      ?? record.announcementId ?? record.unitId ?? record.offeringId
      ?? (record.schedule as Record<string, unknown> | undefined)?.scheduleId);
    entries.set(id ?? JSON.stringify(item), item);
  }
  return [...entries.values()];
}

// Один экземпляр на подтверждённую сессию внутри постоянного student layout.
// Не используется ни HTTP-кэш, ни постоянное браузерное хранилище.
export class RemoteCache {
  private entries = new Map<string, CacheEntry>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private closed = false;
  private activityQueued = false;
  constructor(readonly scope: string) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  private emit(entry: CacheEntry) {
    this.revision++;
    for (const listener of entry.listeners) listener();
    for (const listener of this.listeners) listener();
  }
  private activityChanged() {
    if (this.activityQueued) return;
    this.activityQueued = true;
    queueMicrotask(() => {
      this.activityQueued = false;
      if (this.closed) return;
      this.revision++;
      for (const listener of this.listeners) listener();
    });
  }
  entry(path: string, schema: z.ZodType<unknown>, allPages = false): CacheEntry {
    const key = `${path}${allPages ? "#all-pages" : ""}`;
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (!entry.listeners.size && !entry.pending && now - entry.touchedAt > RETAIN_MS) this.entries.delete(id);
    }
    let entry = this.entries.get(key);
    if (!entry) {
      // Удаляем только неиспользуемые записи. Активные блоки не теряют данные.
      const idle = [...this.entries].filter(([, e]) => !e.listeners.size).sort((a, b) => a[1].touchedAt - b[1].touchedAt);
      while (this.entries.size >= LIMIT && idle.length) {
        const [id, old] = idle.shift()!; old.controller?.abort(); old.version++; this.entries.delete(id);
      }
      entry = { path, schema, allPages, state: loading, version: 0, loadedAt: 0, attemptedAt: 0, touchedAt: now, stale: false, listeners: new Set() };
      this.entries.set(key, entry);
    }
    entry.touchedAt = now;
    return entry;
  }
  watch(entry: CacheEntry, listener: () => void) {
    entry.listeners.add(listener); this.activityChanged();
    return () => {
      entry.listeners.delete(listener); entry.touchedAt = Date.now(); this.activityChanged();
      // Предпросмотр содержит краткоживущий токен конкретной экспортной выборки.
      if (entry.path.startsWith("/calendar/export-preview?")) queueMicrotask(() => {
        if (!entry.listeners.size) { this.cancel(entry); entry.state = loading; entry.loadedAt = 0; entry.attemptedAt = 0; }
      });
    };
  }
  private cancel(entry: CacheEntry) {
    entry.version++; entry.controller?.abort(); entry.controller = undefined; entry.pending = undefined;
  }
  async ensure(entry: CacheEntry, force = false): Promise<void> {
    if (this.closed) return;
    if (entry.pending) return entry.pending;
    if (!force && !entry.stale && entry.state.kind === "ready" && Date.now() - entry.loadedAt < FRESH_MS) return;
    if (!force && entry.attemptedAt > entry.loadedAt && Date.now() - entry.attemptedAt < 10_000) return;
    const controller = new AbortController(), version = ++entry.version;
    entry.controller = controller; entry.attemptedAt = Date.now();
    entry.state = entry.state.kind === "ready" && Date.now() - entry.loadedAt < RETAIN_MS
      ? { kind: "ready", value: entry.state.value, refreshing: true } : loading;
    const current = () => !this.closed && !controller.signal.aborted && entry.version === version;
    // Promise устанавливается до оповещения подписчиков: повторный запрос присоединится к нему.
    entry.pending = Promise.resolve().then(async () => {
      const timer = setTimeout(() => controller.abort(), 25_000);
      try {
        let value = await this.read(entry.path, entry.schema, controller.signal);
        if (entry.allPages) {
          let page = value as Page;
          const items = [...page.data.items], cursors = new Set<string>();
          let complete = page.meta.completeness === true;
          let dataComplete = page.data.isComplete;
          while (page.data.nextCursor) {
            const cursor = page.data.nextCursor;
            if (cursors.has(cursor) || items.length > 5000) throw new ApiError(502, "INTERNAL_ERROR");
            cursors.add(cursor);
            page = await this.read(`${entry.path}${entry.path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`, entry.schema, controller.signal) as Page;
            items.push(...page.data.items);
            complete &&= page.meta.completeness === true;
            if (dataComplete === false || page.data.isComplete === false) dataComplete = false;
            else if (page.data.isComplete === null) dataComplete = null;
          }
          if (items.length > 5000) throw new ApiError(502, "INTERNAL_ERROR");
          value = { ...page, data: { ...page.data, items: uniqueItems(items), isComplete: dataComplete }, meta: { ...page.meta, completeness: complete } };
        }
        if (!current()) return;
        entry.state = { kind: "ready", value }; entry.loadedAt = Date.now(); entry.stale = false;
      } catch (error) {
        if (this.closed || entry.version !== version) return;
        const message = error instanceof ApiError && error.status === 404 ? "Запись не найдена или больше недоступна." : safeClientMessage(error);
        const forbidden = error instanceof ApiError && [401, 403, 404].includes(error.status);
        entry.state = !forbidden && entry.state.kind === "ready" && Date.now() - entry.loadedAt < RETAIN_MS
          ? { kind: "ready", value: entry.state.value, refreshError: message }
          : { kind: "error", message };
      } finally {
        clearTimeout(timer);
        if (!this.closed && entry.version === version) { entry.pending = undefined; entry.controller = undefined; this.emit(entry); }
      }
    });
    this.emit(entry);
    return entry.pending;
  }
  private async read(path: string, schema: z.ZodType<unknown>, signal: AbortSignal) {
    return api(path, schema, { signal, onSessionScope: scope => {
      if (scope !== this.scope) { expireClientSession(); throw new ApiError(401, "SESSION_EXPIRED"); }
    } });
  }
  // Пагинация может обновить только ту версию списка, из которой был взят cursor.
  replace(entry: CacheEntry, version: number, state: Remote<unknown>) {
    if (this.closed || entry.version !== version || entry.pending) return;
    if (state.kind === "ready") {
      const value = state.value as Partial<Page>;
      if (Array.isArray(value?.data?.items)) state = { ...state, value: { ...value, data: { ...value.data, items: uniqueItems(value.data.items) } } };
    }
    entry.state = state; entry.version++; this.emit(entry);
  }
  markNotificationsRead(keys?: string[]) {
    const selected = keys ? new Set(keys) : null;
    for (const entry of this.entries.values()) {
      if (entry.state.kind !== "ready") continue;
      const path = entry.path.split("?")[0];
      if (path !== "/notifications" && path !== "/dashboard") continue;
      const value = entry.state.value as { data?: { items?: unknown[]; notifications?: unknown[] } };
      const update = (items: unknown[], unreadOnly: boolean) => items.map(raw => {
        const item = raw as { notificationKey?: string; isRead?: boolean };
        return item.notificationKey && (!selected || selected.has(item.notificationKey)) ? { ...item, isRead: true } : item;
      }).filter(raw => !unreadOnly || !(raw as { isRead?: boolean }).isRead);
      if (path === "/notifications" && Array.isArray(value.data?.items)) {
        const unreadOnly = new URLSearchParams(entry.path.split("?")[1] ?? "").get("unreadOnly") === "true";
        entry.state = { ...entry.state, value: { ...value, data: { ...value.data, items: update(value.data.items, unreadOnly) } } };
      } else if (path === "/dashboard" && Array.isArray(value.data?.notifications)) {
        entry.state = { ...entry.state, value: { ...value, data: { ...value.data, notifications: update(value.data.notifications, true) } } };
      }
      this.emit(entry);
    }
  }
  invalidate(prefixes: string[], refresh = true) {
    if (this.closed) return;
    for (const entry of this.entries.values()) {
      const path = entry.path.split("?")[0];
      if (!prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) continue;
      this.cancel(entry); entry.stale = true; entry.attemptedAt = 0;
      this.emit(entry);
      if (refresh && entry.listeners.size) void this.ensure(entry);
    }
  }
  reload(entry: CacheEntry) {
    // Обновление обращения также обновляет видимую переписку и её cursor.
    if (/^\/appeals\/[^/?]+$/.test(entry.path)) this.invalidate([`${entry.path}/messages`]);
    return this.ensure(entry, true);
  }
  revalidateActive() {
    for (const entry of this.entries.values()) if (entry.listeners.size && !entry.path.startsWith("/calendar/export-preview?")) void this.ensure(entry);
  }
  activeErrors() { return [...this.entries.values()].filter(e => e.listeners.size && e.state.kind === "ready" && e.state.refreshError); }
  activeRefreshing() { return [...this.entries.values()].some(e => e.listeners.size && e.state.kind === "ready" && e.state.refreshing); }
  dispose() {
    this.closed = true;
    for (const entry of this.entries.values()) { this.cancel(entry); entry.state = loading; this.emit(entry); }
    this.entries.clear();
  }
}

export function mutationPrefixes(path: string): string[] {
  if (path.startsWith("/notifications/")) return ["/notifications", "/dashboard"];
  if (path === "/operations/resolve") return ["/requests", "/appeals", "/notifications", "/dashboard"];
  if (path === "/requests" || path.startsWith("/requests/")) return ["/requests", "/notifications", "/dashboard"];
  if (path === "/appeals" || path.startsWith("/appeals/")) return ["/appeals", "/notifications", "/dashboard"];
  return [path.split("?")[0], "/dashboard"];
}
const Context = createContext<RemoteCache | null>(null);
export function RemoteCacheProvider({ cache, children }: { cache: RemoteCache; children: ReactNode }) {
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}
export function useRemoteCache() {
  const cache = useContext(Context);
  if (!cache) throw new Error("Данные кабинета требуют подтверждённой сессии.");
  return cache;
}
export function RemoteRefreshNotice() {
  const cache = useRemoteCache();
  useSyncExternalStore(cache.subscribe, cache.snapshot, cache.snapshot);
  const failed = cache.activeErrors();
  const refreshing = cache.activeRefreshing();
  if (!failed.length) return refreshing ? <RefreshProgress /> : null;
  return <div className="notice notice-warning" role="alert">Не удалось обновить часть сведений. Показана ранее загруженная версия. <button type="button" className="button button-secondary" onClick={() => { for (const entry of failed) void cache.reload(entry); }}>Повторить обновление</button></div>;
}
function RefreshProgress() {
  const [showProgress, setShowProgress] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowProgress(true), 180);
    return () => clearTimeout(timer);
  }, []);
  return showProgress ? <p className="small muted" role="status">Обновляем сведения…</p> : null;
}
