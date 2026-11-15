import { ScheduleDetailResponseSchema } from "@/shared/contracts/student-api";
import { emptyQuery, query, readRoute } from "@/shared/server/route";
import { scheduleService } from "@/modules/schedule/composition";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  return readRoute(ScheduleDetailResponseSchema, async (auth, request) => {
    query(request, emptyQuery);
    return (await scheduleService(auth)).detail(scheduleId);
  })(request);
}
