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
export async function api<T>(path: string, schema: z.ZodType<T> | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...options, credentials: "same-origin", cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) {
    const code = typeof body?.error?.code === "string" ? body.error.code : "INTERNAL_ERROR";
    if (response.status === 401 && code !== "INVALID_CREDENTIALS" && typeof window !== "undefined") window.dispatchEvent(new Event("puls-session-expired"));
    throw new ApiError(response.status, code);
  }
  if (!schema) return undefined as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(502, "INTERNAL_ERROR");
  return parsed.data;
}
export function safeClientMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Сейчас не удаётся выполнить действие. Попробуйте ещё раз.";
}
