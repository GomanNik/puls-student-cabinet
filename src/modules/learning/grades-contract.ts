import { z } from "zod";
import { AssessmentValueSchema, DataStateSchema, ResponseMetaSchema } from "@/shared/contracts/student-api";

// Официальные итоги за ОДИН учебный период авторизованного студента.
// Текущие результаты работ не входят в эту ведомость.
export const GradeRowSchema = z.strictObject({
  offeringId: z.string().min(1).max(240),
  title: z.string().min(1),
  controls: z.array(z.string().min(1)),
  controlsState: DataStateSchema,
  resultState: DataStateSchema,
  value: AssessmentValueSchema.optional(),
  assessedAt: z.string().datetime({ offset: true }).optional(),
});
export type GradeRow = z.infer<typeof GradeRowSchema>;

export const GradeReportResponseSchema = z.strictObject({
  data: z.strictObject({
    periodId: z.string().min(1).max(240),
    items: z.array(GradeRowSchema),
    isComplete: z.boolean(),
    dataState: DataStateSchema,
  }),
  meta: ResponseMetaSchema,
});
export type GradeReportResponse = z.infer<typeof GradeReportResponseSchema>;
