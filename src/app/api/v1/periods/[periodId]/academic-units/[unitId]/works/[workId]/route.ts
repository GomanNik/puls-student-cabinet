import { learningHandler } from "@/modules/learning/handlers";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ periodId: string; unitId: string; workId: string }> }) { return learningHandler("unitWork", context.params)(request); }
