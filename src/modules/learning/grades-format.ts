import type { GradeRow } from "./grades-contract";

export function gradeControlLabel(row: Pick<GradeRow, "controls" | "controlsState">): string {
  if (row.controls.length) return row.controls.join(", ");
  if (row.controlsState === "SOURCE_ERROR") return "Временно недоступно";
  if (row.controlsState === "NOT_APPLICABLE") return "Не предусмотрена";
  return "Не указана";
}

export function officialGradeLabel(row: Pick<GradeRow, "resultState" | "value">): string {
  // Итог из источника нельзя показывать до подтверждения статуса READY.
  if ((row.resultState === "READY" || row.resultState === "KNOWN_ZERO") && row.value) {
    return row.value.rawValueText ?? row.value.numeric ?? row.value.text ?? row.value.code ?? "Нет сведений";
  }
  switch (row.resultState) {
    case "PENDING": return "Ожидается";
    case "NOT_APPLICABLE": return "Не предусмотрено";
    case "SOURCE_ERROR": return "Временно недоступно";
    case "FORBIDDEN": return "Недоступно";
    case "KNOWN_ZERO": return "0";
    default: return "Нет сведений";
  }
}

/** Дата из исходного ISO timestamp; без вымышленного часового пояса студента. */
export function assessedDate(value?: string): string {
  if (!value) return "—";
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`));
}
