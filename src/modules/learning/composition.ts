import "server-only";
import type { AuthContext } from "@/modules/auth/context";
import { StudentAcademicContext } from "@/modules/student-context/scope";
import { fixtureProvider } from "@/server/integrations/fixture-provider";
import { database } from "@/shared/server/db";
import { ScheduleService } from "@/modules/schedule/service";
import { LearningService } from "./service";
export async function learningService(auth: AuthContext, db=database()) {
  const provider = fixtureProvider(), context = await StudentAcademicContext.load(db, auth, provider, provider.today());
  return new LearningService(context, provider, new ScheduleService(context, provider));
}
