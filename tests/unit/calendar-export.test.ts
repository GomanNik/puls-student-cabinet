import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { serializeCalendar } from "@/modules/community/export";
import type { CalendarItem } from "@/shared/contracts/student-api";

const selection = { from: "2026-11-16", to: "2026-11-30", eventKinds: ["ACADEMIC", "UNIVERSITY"] as Array<"ACADEMIC" | "UNIVERSITY"> };
const items: CalendarItem[] = [
  { eventKey: "deadline-1", origin: "ACADEMIC_DEADLINE", title: "=Непроверенная формула", disciplineLabel: "+Математика", starts: { precision: "DATE_ONLY", on: "2026-11-20" }, description: "Срок; без времени" },
  { eventKey: "university-1", origin: "UNIVERSITY_EVENT", title: "Объявление, встреча", starts: { precision: "DATE_TIME", at: "2026-11-25T09:00:00.000Z", timeZone: "Asia/Omsk" }, location: "Аудитория 1" },
];

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://localhost:3444");
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/puls_test");
  vi.stubEnv("AUTH_RATE_LIMIT_HMAC_KEY", "a".repeat(43));
  vi.stubEnv("TRUSTED_PROXY_KEY", "b".repeat(43));
});
afterEach(() => vi.unstubAllEnvs());

describe("ФТ-45–ФТ-48: одна выборка для трёх форматов", () => {
  it("ICS сохраняет дату без придуманного времени, UTC и экранирование", async () => {
    const file = await serializeCalendar(items, selection, "ics");
    const body = file.bytes.toString("utf8").replace(/\r\n /g, "");
    expect(file.mime).toContain("text/calendar");
    expect((body.match(/BEGIN:VEVENT/g) ?? []).length).toBe(items.length);
    expect(body).toContain("DTSTART;VALUE=DATE:20261120");
    expect(body).toContain("DTEND;VALUE=DATE:20261121");
    expect(body).toContain("DTSTART:20261125T090000Z");
    expect(body).toContain("SUMMARY:Объявление\\, встреча");
    expect(body).toContain("Срок\\; без времени");
    expect(body).not.toContain("DTSTART:20261120T000000Z");
    expect(body).toContain("END:VCALENDAR");
  });

  it("XLSX содержит те же события, дисциплину из источника и безопасные текстовые ячейки", async () => {
    const file = await serializeCalendar(items, selection, "xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file.bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
    const sheet = book.getWorksheet("Календарь")!;
    expect(sheet.rowCount).toBe(items.length + 1);
    expect(sheet.getRow(1).getCell(5).value).toBe("Дисциплина");
    expect(sheet.getRow(2).getCell(3).value).toBe("'=Непроверенная формула");
    expect(sheet.getRow(2).getCell(5).value).toBe("'+Математика");
    expect(sheet.getRow(2).getCell(2).value).toBe("");
    expect(sheet.getRow(3).getCell(3).value).toBe(items[1].title);
    expect(sheet.getRow(3).getCell(5).value).toBe("");
    expect(book.getWorksheet("О выборке")?.getRow(3).getCell(2).value).toBe(items.length);
  });

  it("PDF создаётся из той же выборки с русскими метаданными", async () => {
    const file = await serializeCalendar(items, selection, "pdf");
    expect(file.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(file.filename).toBe("puls-calendar-2026-11-16-2026-11-30.pdf");
    const document = await PDFDocument.load(file.bytes);
    expect(document.getPageCount()).toBeGreaterThan(0);
    expect(document.getTitle()).toBe("События календаря ПУЛЬС");
  });
});
