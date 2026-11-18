import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AdministrationFixture } from "@/server/integrations/administration-fixture";
import type { RequestSubmitCommand, AppealSubmitCommand, MessageSubmitCommand } from "@/server/integrations/contracts";

const sourceCode = "UNIVERSITY_FIXTURE", externalStudentId = "fixture-student-a";
const acceptedAt = new Date("2026-11-16T08:00:00.000Z");
const request = (): RequestSubmitCommand => ({ sourceCode, externalStudentId, operationId: randomUUID(), correlationId: randomUUID(), requestTypeCode: "DEMO_CERTIFICATE", formSchemaVersion: "v1", submittedData: { copies: 1 } });
const appeal = (): AppealSubmitCommand => ({ sourceCode, externalStudentId, operationId: randomUUID(), correlationId: randomUUID(), categoryCode: "QUESTION", subject: "Учебный вопрос", firstMessage: "Здравствуйте! Подскажите дату консультации." });
const message = (): MessageSubmitCommand => ({ sourceCode, externalStudentId, messageId: randomUUID(), correlationId: randomUUID(), externalAppealId: "demo-appeal", body: "Спасибо за разъяснение." });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("тестовый административный источник и состояния доставки", () => {
  it("сохраняет идентичность удалённой операции при повторном запросе статуса", () => {
    const fixture = new AdministrationFixture(), input = request();
    const submitted = fixture.request(input, acceptedAt, new Date(+acceptedAt + 1_000));
    const replay = fixture.requestStatus(input, acceptedAt);
    expect(submitted.externalOperationId).toBe(replay.externalOperationId);
    expect(submitted.correlationId).toBe(input.correlationId);
    expect(submitted.transportState).toBe("ACKNOWLEDGED");
    expect(submitted.businessStatus).toBe("SUBMITTED");
    expect(submitted.transitions).toHaveLength(1);
  });

  it("официальные переходы возникают только после соответствующего времени источника", () => {
    const fixture = new AdministrationFixture(), input = request();
    const early = fixture.request(input, acceptedAt, new Date(+acceptedAt + 29_999));
    const processing = fixture.request(input, acceptedAt, new Date(+acceptedAt + 30_000));
    const ready = fixture.request(input, acceptedAt, new Date(+acceptedAt + 90_000));
    expect(early.transitions.map(item => item.businessStatus)).toEqual(["SUBMITTED"]);
    expect(processing.transitions.map(item => item.businessStatus)).toEqual(["SUBMITTED", "IN_PROGRESS"]);
    expect(ready.transitions.map(item => item.businessStatus)).toEqual(["SUBMITTED", "IN_PROGRESS", "READY"]);
    expect(ready.transitions.map(item => item.occurredAt)).toEqual([acceptedAt.toISOString(), new Date(+acceptedAt + 30_000).toISOString(), new Date(+acceptedAt + 90_000).toISOString()]);
  });

  it("отклонение остаётся официальным состоянием с причиной, без вымышленной готовности", () => {
    vi.stubEnv("PULS_ADMIN_FIXTURE_SCENARIO", "rejected");
    const result = new AdministrationFixture().request(request(), acceptedAt, new Date(+acceptedAt + 90_000));
    expect(result.businessStatus).toBe("REJECTED");
    expect(result.transitions.at(-1)).toMatchObject({ businessStatus: "REJECTED", reason: expect.stringContaining("Демонстрационный отказ") });
    expect(result.transitions.some(item => item.businessStatus === "READY")).toBe(false);
  });

  it.each(["unavailable", "timeout"])("%s не подменяет неподтверждённую передачу успехом", scenario => {
    vi.stubEnv("PULS_ADMIN_FIXTURE_SCENARIO", scenario);
    expect(() => new AdministrationFixture().request(request(), acceptedAt)).toThrowError(expect.objectContaining({ status: scenario === "timeout" ? 504 : 503 }));
  });

  it("неопределённый исход первой передачи допускает последующую проверку того же ключа", () => {
    vi.stubEnv("PULS_ADMIN_FIXTURE_SCENARIO", "timeout-after-accept");
    const fixture = new AdministrationFixture(), input = request();
    expect(() => fixture.request(input, acceptedAt, acceptedAt)).toThrowError(expect.objectContaining({ status: 504 }));
    const status = fixture.requestStatus(input, acceptedAt);
    expect(status.operationId).toBe(input.operationId);
    expect(status.transportState).toBe("ACKNOWLEDGED");
  });

  it("устаревший снимок и смена revision без смены статуса различаются", () => {
    const input = request(), fixture = new AdministrationFixture();
    vi.stubEnv("PULS_ADMIN_FIXTURE_SCENARIO", "stale-status");
    const stale = fixture.request(input, acceptedAt, new Date(+acceptedAt + 45_000));
    const fresh = fixture.request(input, acceptedAt, new Date(+acceptedAt + 60_000));
    expect(stale.businessStatus).toBe("SUBMITTED");
    expect(fresh.businessStatus).toBe("IN_PROGRESS");
    vi.stubEnv("PULS_ADMIN_FIXTURE_SCENARIO", "same-status-revision");
    const first = fixture.request(input, acceptedAt, new Date(+acceptedAt + 1_000));
    const second = fixture.request(input, acceptedAt, new Date(+acceptedAt + 16_000));
    expect(first.businessStatus).toBe(second.businessStatus);
    expect(first.sourceRevision).not.toBe(second.sourceRevision);
    expect(Date.parse(second.sourceUpdatedAt!)).toBeGreaterThan(Date.parse(first.sourceUpdatedAt!));
  });

  it("ответы на обращения получают устойчивый ID; повтор источника выявляется по нему", () => {
    const fixture = new AdministrationFixture(), input = appeal();
    const ack = fixture.appeal(input, acceptedAt);
    expect(ack.transportState).toBe("ACKNOWLEDGED");
    const sent = message();
    const messageAck = fixture.message({ ...sent, externalAppealId: ack.externalAppealId! }, acceptedAt, new Date(+acceptedAt + 2_000));
    expect(messageAck.externalMessageId).toBeTruthy();
    vi.stubEnv("PULS_ADMIN_FIXTURE_SCENARIO", "duplicate-reply");
    const replies = fixture.replies(sourceCode, externalStudentId, ack.externalAppealId!, [{ messageId: sent.messageId, acceptedAt }], new Date(+acceptedAt + 31_000));
    expect(replies).toHaveLength(2);
    expect(replies[0].externalMessageId).toBe(replies[1].externalMessageId);
    expect(replies[0].senderKind).toBe("EXTERNAL_PARTY");
  });

  it("источник отвергает чужого адресата и чужой sourceCode", () => {
    const fixture = new AdministrationFixture(), input = request();
    expect(() => fixture.request({ ...input, externalStudentId: "unrelated-student" }, acceptedAt)).toThrowError(expect.objectContaining({ status: 502 }));
    expect(() => fixture.request({ ...input, sourceCode: "FOREIGN_SOURCE" }, acceptedAt)).toThrowError(expect.objectContaining({ status: 502 }));
  });
});
