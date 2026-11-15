import { learningHandler } from "@/modules/learning/handlers";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { return learningHandler("material", context.params)(request); }
