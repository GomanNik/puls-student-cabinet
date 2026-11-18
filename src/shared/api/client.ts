import type { z } from "zod";

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Неверный логин или пароль",
  AUTH_REQUIRED: "Войдите в личный кабинет.",
  SESSION_EXPIRED: "Сессия завершилась. Войдите снова.",
  RATE_LIMITED: "Слишком много попыток. Подождите и попробуйте ещё раз.",
  VALIDATION_ERROR: "Проверьте введённые данные.",
  CSRF_ORIGIN_INVALID: "Не удалось проверить запрос. Обновите страницу.",
  SOURCE_REVISION_CHANGED: "Учебные данные изменились. Обновите список, чтобы продолжить.",
  CALENDAR_SELECTION_EMPTY: "Нет событий для экспорта в выбранном периоде.",
  CALENDAR_SELECTION_CHANGED: "Выборка изменилась. Повторите предпросмотр экспорта.",
  SOURCE_INCOMPLETE: "Часть выбранных источников не подтверждена. Попробуйте позже.",
  FORM_SCHEMA_CHANGED: "Форма изменилась. Откройте её заново.",
  IDEMPOTENCY_CONFLICT: "Эта отправка уже связана с другими данными. Проверьте историю.",
  OPERATION_UNRESOLVED: "Исход отправки не подтверждён. Проверьте историю перед новым действием.",
};
// OGE apiError: типизированная ошибка; технический message больше не показывается.
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly requestId?: string) {
    super(messages[code] ?? "Сейчас не удаётся получить данные. Попробуйте ещё раз.");
    this.name = "ApiError";
  }
}
// Только память текущей вкладки; при смене сессии ответы старых запросов отбрасываются.
let sessionScope: string | null = null;
let sessionEpoch = 0;
type SharedRead = { controller: AbortController; promise: Promise<Response>; users: number };
const reads = new Map<string, SharedRead>();
export function setClientSessionScope(scope: string | null) {
  if (scope !== sessionScope || scope === null) {
    sessionScope = scope; sessionEpoch++;
    for (const read of reads.values()) read.controller.abort();
    reads.clear();
  }
}
export function expireClientSession() {
  setClientSessionScope(null);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("puls-session-expired"));
}
type ApiOptions = RequestInit & {
  sessionProbe?: boolean;
  onSessionScope?: (scope: string | null) => void;
};
// Объединяется только транспорт GET без дополнительных параметров запроса.
// Отмена одного потребителя не прерывает запрос остальных потребителей.
function fetchApi(path: string, request: RequestInit): Promise<Response> {
  const options = { ...request, credentials: "same-origin" as const, cache: "no-store" as const };
  if ((request.method ?? "GET").toUpperCase() !== "GET" || Object.keys(request).some(key => key !== "signal" && key !== "method")) return fetch(`/api/v1${path}`, options);
  if (request.signal?.aborted) return Promise.reject(new DOMException("Запрос отменён", "AbortError"));
  const key = `${sessionEpoch}:${path}`;
  let shared = reads.get(key);
  if (!shared) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const finish = () => { clearTimeout(timer); if (reads.get(key)?.controller === controller) reads.delete(key); };
    const promise = fetch(`/api/v1${path}`, { ...options, signal: controller.signal }).then(async response => {
      // 401 передаётся немедленно. Для JSON удерживаем отмену и таймаут до
      // конца тела, а не только до заголовков; каждый потребитель получает копию.
      if (response.status === 401) { void response.body?.cancel().catch(() => {}); return new Response(null, { status: 401, headers: response.headers }); }
      const body = await response.arrayBuffer();
      return new Response(body.byteLength ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    }).then(response => { finish(); return response; }, error => { finish(); throw error; });
    shared = { controller, promise, users: 0 }; reads.set(key, shared);
  }
  const read = shared; read.users++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const release = () => { settled = true; request.signal?.removeEventListener("abort", abort); read.users--; };
    const abort = () => {
      if (settled) return;
      release();
      if (!read.users) { read.controller.abort(); if (reads.get(key) === read) reads.delete(key); }
      reject(new DOMException("Запрос отменён", "AbortError"));
    };
    request.signal?.addEventListener("abort", abort, { once: true });
    read.promise.then(response => { if (!settled) { release(); resolve(response.clone()); } }, error => { if (!settled) { release(); reject(error); } });
  });
}
export async function api<T>(path: string, schema: z.ZodType<T> | null, options: ApiOptions = {}): Promise<T> {
  const { sessionProbe = false, onSessionScope, ...request } = options;
  const epoch = sessionEpoch, scope = sessionScope;
  const mutation = !["GET", "HEAD"].includes((request.method ?? "GET").toUpperCase()) && !path.startsWith("/auth/") && path !== "/assistant/ask";
  try {
    const response = await fetchApi(path, request);
    if (epoch !== sessionEpoch || request.signal?.aborted) throw new DOMException("Запрос устарел", "AbortError");
    // Проверяем статус до разбора JSON: даже ответ 401 без JSON завершает сессию.
    if (response.status === 401 && path !== "/auth/login") {
      if (!sessionProbe) expireClientSession();
      throw new ApiError(401, "SESSION_EXPIRED");
    }
    const responseScope = response.headers.get("X-Puls-Session-Scope");
    if (!sessionProbe && scope && responseScope && responseScope !== scope) {
      expireClientSession();
      throw new ApiError(401, "SESSION_EXPIRED");
    }
    if (response.status === 204) return undefined as T;
    const body = await response.json();
    if (epoch !== sessionEpoch || request.signal?.aborted) throw new DOMException("Запрос устарел", "AbortError");
    if (!response.ok) {
      const code = typeof body?.error?.code === "string" ? body.error.code : "INTERNAL_ERROR";
      throw new ApiError(response.status, code);
    }
    if (!schema) return undefined as T;
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(502, "INTERNAL_ERROR");
    onSessionScope?.(responseScope);
    return parsed.data;
  } finally {
    // Сбрасываем связанные выборки и при неопределённом исходе записи.
    if (mutation && scope && epoch === sessionEpoch && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("puls-data-changed", { detail: { path, scope } }));
    }
  }
}
export function safeClientMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Сейчас не удаётся выполнить действие. Попробуйте ещё раз.";
}
