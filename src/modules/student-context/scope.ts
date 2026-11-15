import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { assertAuthContext, type AuthContext } from "@/modules/auth/context";
import { IDLE_MS } from "@/modules/auth/service";
import { AppError } from "@/shared/server/errors";
import { opaqueRef } from "@/shared/server/references";
import { notFound } from "@/shared/server/route";
import type { AcademicContextPort, SourceIdentity, SourcePeriod } from "@/server/integrations/academic-port";
import type { AcademicPeriod, Assignment, ContextRecord, Offering, Audience, Membership } from "@/server/integrations/contracts";

const knownScopes = new WeakSet<object>();
declare const academicScope: unique symbol;
export type AuthorizedAcademicScope = Readonly<SourcePeriod & {
  [academicScope]: true; accountId: string; on: string; offeringIds: readonly string[];
  officialAssignments: readonly Readonly<Assignment>[]; uncertainOfferingIds: readonly string[];
  groupId?: string; facultyId?: string; programId?: string; course?: number;
}>;
export function assertAcademicScope(scope: AuthorizedAcademicScope) {
  if (!knownScopes.has(scope)) throw new Error("Учебная область не подтверждена сервером.");
}
export interface AcademicScopeResolver { resolve(context: AuthContext, periodId: string): Promise<AuthorizedAcademicScope>; }
export const unavailableAcademicScope: AcademicScopeResolver = { async resolve(context) {
  assertAuthContext(context); throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Учебный контекст пока недоступен.");
} };
export class StudentAcademicContext {
  private scopes = new Map<string, Promise<AuthorizedAcademicScope>>();
  private offerings = new Map<string, Promise<Offering[]>>();
  private incomplete = false;
  private constructor(readonly auth: AuthContext, readonly identity: SourceIdentity, readonly record: ContextRecord,
    readonly port: AcademicContextPort, readonly revision: string, readonly isComplete: boolean, readonly today: string) {}

  static async load(db: PrismaClient, auth: AuthContext, port: AcademicContextPort, today: string) {
    assertAuthContext(auth);
    const now = new Date(), day = new Date(`${today}T00:00:00Z`);
    // OGE learning-access: ownership включён в запрос, состояние проверяется на сервере.
    const identities = await db.studentExternalIdentity.findMany({ where: { accountId: auth.accountId,
      AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: day } }] }, { OR: [{ validTo: null }, { validTo: { gte: day } }] }],
      account: { accountStateCode: "ACTIVE", credentials: { some: { credentialStateCode: "ACTIVE" } },
        sessions: { some: { sessionId: auth.sessionId, revokedAt: null, expiresAt: { gt: now }, lastActivityAt: { gt: new Date(now.getTime() - IDLE_MS) } } } } } });
    if (identities.length !== 1) throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Не удалось подтвердить учебный контекст.");
    const identity: SourceIdentity = Object.freeze({ sourceCode: identities[0].sourceCode, externalStudentId: identities[0].externalStudentId });
    const result = await port.getContext(identity);
    if (result.sourceCode !== identity.sourceCode || result.requestedScope.externalStudentId !== identity.externalStudentId || result.items.length !== 1 || result.availability === "ERROR")
      throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Учебный контекст недоступен.");
    const record = result.items[0];
    if (record.externalStudentId !== identity.externalStudentId || record.ref.sourceCode !== identity.sourceCode || new Set(record.periods.map(p => p.periodId)).size !== record.periods.length || record.periods.some(p => p.ref.sourceCode !== identity.sourceCode))
      throw new AppError(502, "EXTERNAL_INVALID_RESPONSE", "Не удалось подтвердить учебный контекст.");
    return new StudentAcademicContext(auth, identity, record, port, result.sourceRevision ?? "unversioned", result.isComplete === true, today);
  }
  get partial() { return !this.isComplete || this.incomplete; }
  markIncomplete() { this.incomplete = true; }
  id(kind: string, ...ids: string[]) { return opaqueRef(this.auth.accountId, this.identity.sourceCode, kind, ...ids); }
  periodId(period: AcademicPeriod | string) { return this.id("period", typeof period === "string" ? period : period.periodId); }
  offeringId(period: string, offering: string) { return this.id("offering", period, offering); }
  sourcePeriod(period: AcademicPeriod): SourcePeriod { return { ...this.identity, periodId: period.periodId }; }
  period(publicId: string) { const period = this.record.periods.find(p => this.periodId(p) === publicId); if (!period) throw notFound(); return period; }
  currentPeriod() { return this.record.periods.find(p => p.startsOn && p.endsOn && p.startsOn <= this.today && p.endsOn >= this.today); }
  private membership(offering: Offering): Membership | undefined {
    return this.record.memberships.find(m => m.state === "CONFIRMED" && m.externalStudentId === this.identity.externalStudentId && m.periodId === offering.periodId && m.offeringId === offering.offeringId &&
      m.membershipRef.sourceCode === this.identity.sourceCode && m.membershipRef.externalId === offering.membershipRef.externalId && m.membershipRef.objectKind === offering.membershipRef.objectKind);
  }
  getOfferings(period: AcademicPeriod) {
    if (!this.offerings.has(period.periodId)) this.offerings.set(period.periodId, (async () => {
      const response = await this.port.getOfferings(this.sourcePeriod(period));
      this.checkRead(response, period);
      if (response.availability === "ERROR") throw new AppError(503, "EXTERNAL_UNAVAILABLE", "Список дисциплин недоступен.");
      const valid = response.items.filter(o => o.periodId === period.periodId && o.ref.sourceCode === this.identity.sourceCode && o.membershipRef.sourceCode === this.identity.sourceCode && this.membership(o) && (!o.groupId || o.groupId === this.record.groupId));
      if (valid.length !== response.items.length || response.isComplete !== true) this.incomplete = true;
      if (new Set(valid.map(o => o.offeringId)).size !== valid.length) throw new AppError(502, "EXTERNAL_INVALID_RESPONSE", "Дисциплины не удалось однозначно определить.");
      return valid;
    })());
    return this.offerings.get(period.periodId)!;
  }
  async offering(period: AcademicPeriod, publicId: string) {
    const offering = (await this.getOfferings(period)).find(o => this.offeringId(period.periodId, o.offeringId) === publicId);
    if (!offering) throw notFound(); return offering;
  }
  checkRead(response: { sourceCode: string; requestedScope: { externalStudentId: string; periodId?: string }; sourceRevision?: string }, period: AcademicPeriod) {
    if (response.sourceCode !== this.identity.sourceCode || response.requestedScope.externalStudentId !== this.identity.externalStudentId || response.requestedScope.periodId !== period.periodId)
      throw new AppError(502, "EXTERNAL_INVALID_RESPONSE", "Источник вернул несовместимую область данных.");
    if (response.sourceRevision && response.sourceRevision !== this.revision) throw new AppError(409, "SOURCE_REVISION_CHANGED", "Учебные данные изменились. Обновите страницу.");
  }
  async resolve(period: AcademicPeriod, on: string): Promise<AuthorizedAcademicScope> {
    const key = `${period.periodId}:${on}`;
    if (!this.scopes.has(key)) this.scopes.set(key, (async () => {
      const offerings = await this.getOfferings(period), read = await this.port.getAssignments(this.sourcePeriod(period), on);
      this.checkRead(read, period);
      if(read.isComplete!==true || read.availability==="ERROR")this.incomplete=true;
      const officialAssignments: Assignment[] = [], uncertainOfferingIds: string[] = [];
      for (const offering of offerings) {
        const assignments = read.availability === "ERROR" ? [] : read.items.filter(a => a.isOfficial && a.ref.sourceCode === this.identity.sourceCode && a.externalStudentId === this.identity.externalStudentId && a.periodId === period.periodId && a.offeringId === offering.offeringId);
        if (assignments.length === 1) officialAssignments.push(Object.freeze(assignments[0]));
        else uncertainOfferingIds.push(offering.offeringId);
      }
      if (read.items.some(a => !offerings.some(o => o.offeringId === a.offeringId) || a.externalStudentId !== this.identity.externalStudentId || a.periodId !== period.periodId || a.ref.sourceCode !== this.identity.sourceCode)) this.incomplete = true;
      const scope = Object.freeze({ ...this.sourcePeriod(period), accountId: this.auth.accountId, on, offeringIds: Object.freeze(offerings.map(o => o.offeringId)),
        officialAssignments: Object.freeze(officialAssignments), uncertainOfferingIds: Object.freeze(uncertainOfferingIds), groupId: this.record.groupId, facultyId: this.record.facultyId, programId: this.record.programId, course: this.record.course }) as AuthorizedAcademicScope;
      knownScopes.add(scope); return scope;
    })());
    return this.scopes.get(key)!;
  }
}
export function audienceAllowed(scope: AuthorizedAcademicScope, audience: Audience, offeringId?: string) {
  assertAcademicScope(scope);
  if (audience.sourceRef && audience.sourceRef.sourceCode !== scope.sourceCode) return false;
  switch (audience.scopeType) {
    case "UNIVERSITY": return audience.scopeId === scope.sourceCode;
    case "STUDENT": return audience.scopeId === scope.externalStudentId;
    case "GROUP": return audience.scopeId === scope.groupId;
    case "FACULTY": return audience.scopeId === scope.facultyId;
    case "PROGRAM_COURSE": return !!scope.programId && audience.scopeId === `${scope.programId}:${scope.course}`;
    case "OFFERING": return scope.offeringIds.includes(audience.scopeId) && (!offeringId || audience.scopeId === offeringId);
    case "SUBGROUP": return !!offeringId && audience.offeringId === offeringId && scope.officialAssignments.some(a => a.offeringId === offeringId && a.subgroupId === audience.scopeId);
  }
}
