import "server-only";
import type { ActualRead, AssignmentRead, AttendanceRead, ContextRead, OfferingRead, ChangeRead, ScheduleRead } from "./contracts";

export type SourceIdentity = Readonly<{ sourceCode: string; externalStudentId: string }>;
export type SourcePeriod = SourceIdentity & Readonly<{ periodId: string }>;
export type SourceRange = Readonly<{ from: string; to: string }>;
export interface AcademicContextPort {
  getContext(identity: SourceIdentity): Promise<ContextRead>;
  getOfferings(scope: SourcePeriod): Promise<OfferingRead>;
  getAssignments(scope: SourcePeriod, on: string): Promise<AssignmentRead>;
}
export interface SchedulePort {
  getSchedule(scope: SourcePeriod, range: SourceRange): Promise<ScheduleRead>;
  getChanges(scope: SourcePeriod, range: SourceRange): Promise<ChangeRead>;
  getActualSessions(scope: SourcePeriod, range: SourceRange): Promise<ActualRead>;
  getAttendance(scope: SourcePeriod, range: SourceRange): Promise<AttendanceRead>;
}
