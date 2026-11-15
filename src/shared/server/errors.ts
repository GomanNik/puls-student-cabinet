import "server-only";
import { Prisma } from "@/generated/prisma/client";

export type ErrorCode = "BAD_REQUEST" | "VALIDATION_ERROR" | "AUTH_REQUIRED" | "INVALID_CREDENTIALS" |
  "SESSION_EXPIRED" | "CSRF_ORIGIN_INVALID" | "ACCESS_FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" |
  "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE" | "INTERNAL_ERROR" | "EXTERNAL_UNAVAILABLE" |
  "SOURCE_REVISION_CHANGED" | "EXTERNAL_INVALID_RESPONSE" | "EXTERNAL_TIMEOUT" |
  "IDEMPOTENCY_CONFLICT" | "OPERATION_UNRESOLVED" | "FORM_SCHEMA_CHANGED" |
  "CALENDAR_SELECTION_EMPTY" | "CALENDAR_SELECTION_CHANGED" | "SOURCE_INCOMPLETE" | "RANGE_NOT_SUPPORTED";
// Адаптация typed AppError / безопасной границы http-error.filter из OGE Tutor.
export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: ErrorCode, message: string,
    public readonly retryAfter?: number) { super(message); }
}
export const unavailable = () => new AppError(503, "EXTERNAL_UNAVAILABLE", "Сервис временно недоступен. Попробуйте ещё раз.");
export function safeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Prisma.PrismaClientInitializationError || error instanceof Prisma.PrismaClientKnownRequestError)
    return unavailable();
  return new AppError(500, "INTERNAL_ERROR", "Не удалось выполнить действие. Попробуйте ещё раз.");
}
