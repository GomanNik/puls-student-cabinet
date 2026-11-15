import "server-only";
import type { AuthContext } from "@/modules/auth/context";
import { StudentAcademicContext } from "@/modules/student-context/scope";
import { fixtureProvider } from "@/server/integrations/fixture-provider";
import { database } from "@/shared/server/db";
import { ScheduleService } from "./service";

export async function scheduleService(auth: AuthContext) {
  const provider = fixtureProvider();
  const context = await StudentAcademicContext.load(database(), auth, provider, provider.today());
  return new ScheduleService(context, provider);
}
