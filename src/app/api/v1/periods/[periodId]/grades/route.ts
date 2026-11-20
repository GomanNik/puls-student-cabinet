import { GradeReportResponseSchema } from "@/modules/learning/grades-contract";
import { learningService } from "@/modules/learning/composition";
import { emptyQuery, query, readRoute } from "@/shared/server/route";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  return readRoute(GradeReportResponseSchema, async (auth, request) => {
    query(request, emptyQuery);
    return (await learningService(auth)).gradeReport(periodId);
  })(request);
}
