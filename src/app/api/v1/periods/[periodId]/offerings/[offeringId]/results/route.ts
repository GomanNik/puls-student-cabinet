import { learningHandler } from "@/modules/learning/handlers";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ periodId: string; offeringId: string }> }) { return learningHandler("results", context.params)(request); }
