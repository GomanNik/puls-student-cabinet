import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { opaqueRef, pageSlice } from "@/shared/server/references";
import { advanceRequest } from "@/modules/operations/request-state";
import { addDays, daysBetween, localDay, weekStart } from "@/shared/lib/dates";

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://localhost:3444");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/puls_test");
  vi.stubEnv("AUTH_RATE_LIMIT_HMAC_KEY", "a".repeat(43));
  vi.stubEnv("TRUSTED_PROXY_KEY", "b".repeat(43));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("защищённые ссылки и продолжение списков", () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({ id: index }));
  it("соседние страницы не пропускают и не дублируют записи", () => {
    const first = pageSlice(rows, "account-a", ["works", "fall"], "revision-1", 3);
    const second = pageSlice(rows, "account-a", ["works", "fall"], "revision-1", 3, first.nextCursor!);
    const third = pageSlice(rows, "account-a", ["works", "fall"], "revision-1", 3, second.nextCursor!);
    expect([...first.items, ...second.items, ...third.items]).toEqual(rows);
    expect(third.nextCursor).toBeNull();
  });
  it("курсор другого студента, фильтра и подделанная подпись отвергаются", () => {
    const cursor = pageSlice(rows, "account-a", ["works", "fall"], "revision-1", 3).nextCursor!;
    expect(() => pageSlice(rows, "account-b", ["works", "fall"], "revision-1", 3, cursor)).toThrowError(expect.objectContaining({ status: 422 }));
    expect(() => pageSlice(rows, "account-a", ["works", "spring"], "revision-1", 3, cursor)).toThrowError(expect.objectContaining({ status: 422 }));
    expect(() => pageSlice(rows, "account-a", ["works", "fall"], "revision-1", 3, `${cursor}x`)).toThrowError(expect.objectContaining({ status: 422 }));
    expect(opaqueRef("account-a", "SOURCE", "work", "1")).not.toBe(opaqueRef("account-b", "SOURCE", "work", "1"));
  });
  it("изменение источника требует обновить список, истечение курсора требует начать заново", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
    const cursor = pageSlice(rows, "account-a", ["works"], "old-revision", 2).nextCursor!;
    expect(() => pageSlice(rows, "account-a", ["works"], "new-revision", 2, cursor)).toThrowError(expect.objectContaining({ status: 409, code: "SOURCE_REVISION_CHANGED" }));
    vi.advanceTimersByTime(15 * 60_000);
    expect(() => pageSlice(rows, "account-a", ["works"], "old-revision", 2, cursor)).toThrowError(expect.objectContaining({ status: 422 }));
  });
});

describe("официальные переходы заявления", () => {
  const date = (minute: number) => new Date(Date.UTC(2026, 10, 16, 10, minute));
  const transition = (businessStatus: "SUBMITTED" | "IN_PROGRESS" | "READY" | "REJECTED", minute: number, occurrence: string = businessStatus) => ({ businessStatus, eventOccurrenceKey: occurrence, occurredAt: date(minute).toISOString(), sourceRevision: `opaque-${minute}` });
  it("сортирует переходы по времени и не принимает событие позже отметки источника", () => {
    const result = advanceRequest(null, [], [transition("READY", 3), transition("IN_PROGRESS", 2), transition("SUBMITTED", 1), transition("REJECTED", 5)], date(3), null);
    expect(result.changes.map(item => item.businessStatus)).toEqual(["SUBMITTED", "IN_PROGRESS", "READY"]);
    expect(result.status).toBe("READY");
  });
  it("не создаёт дубли при повторной доставке и не откатывает терминальный статус", () => {
    const known = [{ event_occurrence_key: "submitted-1", to_state_code: "SUBMITTED", changed_at: date(1) }, { event_occurrence_key: "ready-1", to_state_code: "READY", changed_at: date(3) }];
    const replay = advanceRequest("READY", known, [transition("SUBMITTED", 1, "submitted-1"), transition("READY", 3, "ready-1"), transition("REJECTED", 4)], date(4), date(3));
    expect(replay).toMatchObject({ status: "READY", advanced: false, changes: [] });
    expect(advanceRequest("READY", known, [transition("IN_PROGRESS", 2)], date(2), date(3)).advanced).toBe(false);
  });
});

describe("даты без искусственного времени", () => {
  it("правильно переходит через конец месяца и високосный день", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(weekStart("2026-11-18")).toBe("2026-11-16");
  });
  it("переводит подтверждённый момент в день источника, а не день UTC", () => {
    expect(localDay("2026-11-15T20:30:00Z", "Asia/Omsk")).toBe("2026-11-16");
  });
});
