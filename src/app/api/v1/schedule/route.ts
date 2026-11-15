import { z } from "zod";
import { ScheduleListResponseSchema } from "@/shared/contracts/student-api";
import { pagingQuery, query, readRoute } from "@/shared/server/route";
import { daysBetween } from "@/shared/lib/dates";
import { scheduleService } from "@/modules/schedule/composition";
export const runtime = "nodejs";
const filters = z.strictObject({ from: z.string().date(), to: z.string().date(), ...pagingQuery }).refine(v => daysBetween(v.from, v.to) >= 0 && daysBetween(v.from, v.to) < 31);
export const GET = readRoute(ScheduleListResponseSchema, async (auth, request) => {
  const params = query(request, filters);
  return (await scheduleService(auth)).list({ from: params.from, to: params.to }, params.limit, params.cursor);
});
