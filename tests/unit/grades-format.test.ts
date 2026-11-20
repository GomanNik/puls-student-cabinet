import { describe, expect, it } from "vitest";
import { assessedDate, gradeControlLabel, officialGradeLabel } from "@/modules/learning/grades-format";

describe("Официальная ведомость: представление результатов", () => {
  it("различает ожидаемый результат, недоступность и отсутствие сведений", () => {
    expect(officialGradeLabel({ resultState: "PENDING" })).toBe("Ожидается");
    expect(officialGradeLabel({ resultState: "SOURCE_ERROR" })).toBe("Временно недоступно");
    expect(officialGradeLabel({ resultState: "UNKNOWN" })).toBe("Нет сведений");
    expect(officialGradeLabel({ resultState: "PENDING", value: { kind: "TEXT", text: "Отлично" } })).toBe("Ожидается");
    expect(officialGradeLabel({ resultState: "NOT_APPLICABLE" })).toBe("Не предусмотрено");
  });
  it("не теряет ноль и сохраняет официальное текстовое значение", () => {
    expect(officialGradeLabel({ resultState: "READY", value: { kind: "NUMERIC", numeric: "0" } })).toBe("0");
    expect(officialGradeLabel({ resultState: "READY", value: { kind: "TEXT", text: "Зачтено" } })).toBe("Зачтено");
    expect(officialGradeLabel({ resultState: "READY", value: { kind: "TEXT", text: "Хорошо" } })).toBe("Хорошо");
  });
  it("показывает календарную дату из источника без смещения в другой часовой пояс", () => {
    expect(assessedDate("2026-05-29T23:55:00-05:00")).toBe("29 мая 2026 г.");
    expect(assessedDate(undefined)).toBe("—");
  });
  it("не придумывает форму контроля", () => {
    expect(gradeControlLabel({ controls: ["Экзамен", "Зачёт"], controlsState: "READY" })).toBe("Экзамен, Зачёт");
    expect(gradeControlLabel({ controls: [], controlsState: "UNKNOWN" })).toBe("Не указана");
    expect(gradeControlLabel({ controls: [], controlsState: "SOURCE_ERROR" })).toBe("Временно недоступно");
  });
});
