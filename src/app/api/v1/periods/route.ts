import { PeriodListResponseSchema } from "@/shared/contracts/student-api";
import { emptyQuery, query, readRoute } from "@/shared/server/route";
import { scheduleService } from "@/modules/schedule/composition";
export const runtime = "nodejs";
export const GET = readRoute(PeriodListResponseSchema, async (auth, request) => {
  query(request, emptyQuery);
  return (await scheduleService(auth)).periods();
});
