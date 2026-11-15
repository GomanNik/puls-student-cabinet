import { AppError } from "@/shared/server/errors";
import { errorResponse } from "@/shared/server/http";
const missing = () => errorResponse(new AppError(404, "NOT_FOUND", "Данные не найдены."));
export const GET = missing;
export const POST = missing;
export const PATCH = missing;
export const DELETE = missing;
