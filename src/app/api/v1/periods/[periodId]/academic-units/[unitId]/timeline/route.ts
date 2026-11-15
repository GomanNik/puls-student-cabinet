import { learningHandler } from "@/modules/learning/handlers";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ periodId: string; unitId: string }> }) { return learningHandler("unitTimeline", context.params)(request); }
