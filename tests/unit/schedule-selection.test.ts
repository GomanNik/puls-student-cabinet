import { describe, expect, it } from "vitest";
import { currentSelection, scheduleContextLabel, scheduleHref } from "@/modules/schedule/selection";

describe("переход и выбранный контекст расписания", () => {
  it("открывает неделю занятия по дню в часовом поясе источника", () => {
    expect(scheduleHref("2026-11-15T20:30:00Z", "Asia/Omsk")).toBe("/schedule?date=2026-11-16");
    expect(scheduleHref("2026-11-15T20:30:00Z", "UTC")).toBe("/schedule?date=2026-11-15");
    expect(scheduleHref(undefined, undefined)).toBe("/schedule");
  });

  it("автоматически берёт собственную группу каждого аккаунта и не сохраняет чужую", () => {
    expect(currentSelection("group", null, true, "ПИ-24-1")).toEqual({ mode: "group", value: "ПИ-24-1" });
    expect(currentSelection("group", null, true, "ИК-23-2")).toEqual({ mode: "group", value: "ИК-23-2" });
    expect(currentSelection("group", "ПИ-24-1", false, "ИК-23-2")).toBeNull();
    expect(currentSelection("group", null, false, "ПИ-24-1")).toBeNull();
  });

  it("подписывает лишь подтверждённый выбор, а не вводимый запрос", () => {
    const teacher = currentSelection("teacher", "Воронова Елена Сергеевна", false, "ПИ-24-1");
    const room = currentSelection("room", "305", false, "ПИ-24-1");
    expect(scheduleContextLabel(currentSelection("group", null, true, "ПИ-24-1")!)).toBe("Расписание группы ПИ-24-1");
    expect(scheduleContextLabel(teacher!)).toBe("Расписание преподавателя Воронова Елена Сергеевна");
    expect(scheduleContextLabel(room!)).toBe("Расписание аудитории 305");
    expect(currentSelection("teacher", null, false, "ПИ-24-1")).toBeNull();
    expect(currentSelection("room", null, false, "ПИ-24-1")).toBeNull();
  });
});
