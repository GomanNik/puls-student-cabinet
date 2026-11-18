"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { z } from "zod";
import { api, ApiError, safeClientMessage } from "./client";
import { ResolveResponseSchema, type ResolveOperationRequest } from "@/shared/contracts/student-api";
import { targetHref } from "@/shared/ui/academic";

type Pending = { key: string; createdAt: number };
const changed = "puls-intention-changed";
function notifyChange() { window.dispatchEvent(new Event(changed)); }
function parsePending(raw: string | null): Pending | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && "key" in value && "createdAt" in value
      && typeof value.key === "string" && typeof value.createdAt === "number") return { key: value.key, createdAt: value.createdAt };
  } catch { /* Некорректную запись покажем как ошибку восстановления. */ }
  return null;
}
export function clearIntentions() {
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("puls-intention:")) sessionStorage.removeItem(key);
  notifyChange();
}
export function useIntention<T>(scope: ResolveOperationRequest["operationScope"], path: string, schema: z.ZodType<T>, complete: (value: T) => void) {
  const storage = `puls-intention:${scope}:${path}`;
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener(changed, listener);
    window.addEventListener("storage", listener);
    return () => { window.removeEventListener(changed, listener); window.removeEventListener("storage", listener); };
  }, []);
  const snapshot = useCallback(() => { try { return sessionStorage.getItem(storage); } catch { return null; } }, [storage]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const restored = parsePending(raw);
  const intent = useRef<Pending | null>(null), payload = useRef<string | null>(null), abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [localUncertain, setUncertain] = useState(false);
  const [hasPayload, setHasPayload] = useState(false), [retryable, setRetryable] = useState(false);
  const [explicitMessage, setMessage] = useState<string | null>(null);
  const uncertain = localUncertain || Boolean(restored && !hasPayload);
  const message = explicitMessage ?? (raw && !restored ? "Не удалось восстановить отправку. Проверьте историю."
    : restored && !hasPayload ? "Найдена незавершённая отправка. Проверьте её результат перед новым действием." : null);
  useEffect(() => () => abort.current?.abort(), [storage]);

  function clear() {
    sessionStorage.removeItem(storage); notifyChange();
    intent.current = null; payload.current = null; setHasPayload(false); setRetryable(false); setUncertain(false);
  }
  async function submit() {
    const current = intent.current;
    if (busy || !current) return;
    if (Date.now() - current.createdAt >= 24 * 60 * 60_000) {
      setUncertain(true); setRetryable(false); setMessage("Срок ключа истёк. Проверьте историю перед новой отправкой."); return;
    }
    if (!payload.current) { setUncertain(true); return; }
    setBusy(true); setMessage(null);
    const controller = new AbortController(); abort.current = controller;
    try {
      const value = await api(path, schema, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": current.key }, body: payload.current, signal: controller.signal });
      if (controller.signal.aborted) return;
      clear(); complete(value);
    } catch (error) {
      if (controller.signal.aborted) return;
      const definite = error instanceof ApiError && [400, 401, 403, 404, 413, 415, 422, 429].includes(error.status);
      if (definite) clear(); else setUncertain(true);
      setMessage(definite ? safeClientMessage(error) : "Ответ сервера не подтверждён. Данные могли сохраниться. Проверьте результат отправки.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function send(data: unknown) {
    if (busy || uncertain || raw) return;
    const current = { key: crypto.randomUUID(), createdAt: Date.now() };
    try { sessionStorage.setItem(storage, JSON.stringify(current)); notifyChange(); }
    catch { setMessage("Не удалось сохранить ключ отправки. Проверьте настройки браузера."); return; }
    intent.current = current; payload.current = JSON.stringify(data); setHasPayload(true); setRetryable(true);
    await submit();
  }
  async function retry() { if (!payload.current || busy || !retryable) return; setUncertain(false); await submit(); }
  async function resolve() {
    const current = intent.current ?? restored;
    if (!current || busy) return;
    setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const result = await api("/operations/resolve", ResolveResponseSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationScope: scope, idempotencyKey: current.key }), signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.data.state === "COMMITTED" && result.data.target) { clear(); location.assign(targetHref(result.data.target)); return; }
      setMessage(result.data.state === "PENDING" ? "Сервер ещё обрабатывает отправку. Повторите проверку." : "Результат не найден или срок ключа истёк. Сначала проверьте историю. Новая отправка может создать отдельную запись.");
    } catch (error) { if (!controller.signal.aborted) setMessage(safeClientMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function startNew() { clear(); setMessage(null); }
  return { send, resolve, retry, canRetry: retryable, startNew, busy, uncertain, message };
}
