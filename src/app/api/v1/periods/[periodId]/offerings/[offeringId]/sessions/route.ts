import { z } from "zod";
import { SessionListResponseSchema } from "@/shared/contracts/student-api";
import { pagingQuery, query, readRoute } from "@/shared/server/route";
import { scheduleService } from "@/modules/schedule/composition";
import { AppError } from "@/shared/server/errors";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ periodId: string; offeringId: string }> }) {
  const { periodId, offeringId } = await params;
  return readRoute(SessionListResponseSchema, async (auth, request) => {
    const filter = query(request, z.strictObject(pagingQuery)), service = await scheduleService(auth);
    const period = service.context.period(periodId);
    if (!period.startsOn || !period.endsOn) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Границы семестра не указаны источником.");
    return service.sessions(periodId, offeringId, { from: period.startsOn, to: period.endsOn }, filter.limit, filter.cursor);
  })(request);
}
