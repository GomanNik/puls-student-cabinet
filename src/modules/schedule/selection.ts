import { localDay } from "@/shared/lib/dates";

export type ScheduleMode = "group" | "teacher" | "room";
export type ScheduleSelection = { mode: ScheduleMode; value: string };

export function scheduleHref(start?: string, timeZone?: string) {
  if (!start || !timeZone) return "/schedule";
  try { return `/schedule?date=${localDay(start, timeZone)}`; }
  catch { return "/schedule"; }
}

export function currentSelection(mode: ScheduleMode, selected: string | null, ownGroup: boolean, group: string | null): ScheduleSelection | null {
  if (mode === "group") {
    if (selected && selected === group) return { mode, value: selected };
    return ownGroup && group ? { mode, value: group } : null;
  }
  return selected ? { mode, value: selected } : null;
}

export function scheduleContextLabel({ mode, value }: ScheduleSelection) {
  if (mode === "group") return `Расписание группы ${value}`;
  if (mode === "teacher") return `Расписание преподавателя ${value}`;
  return `Расписание аудитории ${value}`;
}
