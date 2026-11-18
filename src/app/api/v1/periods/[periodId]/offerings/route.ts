import { z } from "zod";
import { OfferingListResponseSchema } from "@/shared/contracts/student-api";
import { pagingQuery, query, readRoute } from "@/shared/server/route";
import { scheduleService } from "@/modules/schedule/composition";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  return readRoute(OfferingListResponseSchema, async (auth, request) => {
    const filter = query(request, z.strictObject({ ...pagingQuery, search: z.string().trim().min(1).max(160).optional() }));
    return (await scheduleService(auth)).offerings(periodId, filter.limit, filter.cursor, filter.search);
  })(request);
}
