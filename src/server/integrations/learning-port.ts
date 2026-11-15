import "server-only";
import type { SourcePeriod } from "./academic-port";
import type { DeadlineRead } from "./contracts";
import type { UnitRead, WorkRead, ProgressRead, StageRead, StageProgressRead, WorkResultRead, GradingModelRead, AssessmentRead, AttestationRead, CourseResultRead, MaterialRead } from "./contracts";
export type SourceLearningScope = SourcePeriod & ({ offeringId: string; unitId?: never } | { unitId: string; offeringId?: never });
export interface LearningPort {
  readonly timeZone: string;
  getUnits(scope: SourcePeriod): Promise<UnitRead>;
  getWorks(scope: SourceLearningScope): Promise<WorkRead>;
  getProgress(scope: SourceLearningScope): Promise<ProgressRead>;
  getStages(scope: SourceLearningScope, workId: string): Promise<StageRead>;
  getStageProgress(scope: SourceLearningScope, workId: string): Promise<StageProgressRead>;
  getWorkResults(scope: SourceLearningScope, workId: string): Promise<WorkResultRead>;
  getGradingModel(scope: SourceLearningScope): Promise<GradingModelRead>;
  getAssessments(scope: SourceLearningScope): Promise<AssessmentRead>;
  getAttestations(scope: SourceLearningScope): Promise<AttestationRead>;
  getCourseResults(scope: SourceLearningScope): Promise<CourseResultRead>;
  getMaterials(scope: SourceLearningScope): Promise<MaterialRead>;
  getDeadlines(scope: SourceLearningScope): Promise<DeadlineRead>;
}
