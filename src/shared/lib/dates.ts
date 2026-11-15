export function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000); }
export function localDay(instant: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
}
export function weekStart(day: string) { const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); return addDays(day, -((weekday + 6) % 7)); }
export function formatDay(day: string, weekday = false) { return new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric", ...(weekday ? { weekday: "long" } : {}) }).format(new Date(`${day}T12:00:00Z`)); }
export function formatTime(instant: string, timeZone: string) { return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(instant)); }
