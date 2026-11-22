import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { fixtureMaterialContent, learningAssets } from "@/server/integrations/learning-assets";
import { getWorkStatus, isAwaitingReview } from "@/modules/learning/work-status";

describe("ТД-13 и ТД-19: реальные файлы демонстрационных материалов", () => {
  it.each(["guide", "notes"] as const)("%s содержит открываемый PDF с заявленным MIME", async key => {
    const asset = fixtureMaterialContent(`fixture-file:${key}`);
    expect(asset).toMatchObject({ filename: learningAssets[key].filename, mime: "application/pdf" });
    expect(asset!.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(asset!.bytes)).getPageCount()).toBeGreaterThan(0);
  });

  it.each([["solution", "word/document.xml"], ["research", "ppt/presentation.xml"]] as const)("%s содержит соответствующий OOXML-документ", (key, entry) => {
    const asset = fixtureMaterialContent(`fixture-file:${key}`);
    expect(asset).toBeTruthy();
    expect(asset!.bytes.subarray(0, 2).toString()).toBe("PK");
    expect(asset!.bytes.includes(Buffer.from("[Content_Types].xml"))).toBe(true);
    expect(asset!.bytes.includes(Buffer.from(entry))).toBe(true);
  });

  it("XLSX-макет читается как таблица и содержит учебные данные", async () => {
    const asset = fixtureMaterialContent("fixture-file:observations");
    expect(asset).toMatchObject({ filename: "Наблюдения.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asset!.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.length).toBeGreaterThan(0);
    expect(workbook.worksheets.some(sheet => sheet.rowCount > 1)).toBe(true);
  });

  it("неизвестный handle и попытка выхода из каталога не открывают файловую систему", () => {
    for (const handle of ["guide", "fixture-file:missing", "fixture-file:../../.env", "fixture-file:/etc/passwd", "fixture-file:notes/../guide"]) {
      expect(fixtureMaterialContent(handle), handle).toBeNull();
    }
  });
});


describe("единый статус учебной работы", () => {
  const submitted = {
    dataState: "READY" as const,
    assignmentStatusCode: "Выдано",
    completionStatusCode: "Выполнение подтверждено",
    submissionStatusCode: "Передано на проверку",
    submittedAt: "2026-11-09T12:00:00+06:00",
  };
  const publishedZero = {
    value: { kind: "NUMERIC" as const, numeric: "0", rawValueText: "0 баллов" },
    assessedAt: "2026-11-10T10:00:00+06:00",
  };

  it("показывает отправленную работу на проверке, если результата ещё нет", () => {
    expect(getWorkStatus(submitted, null)).toBe("AWAITING_REVIEW");
    expect(isAwaitingReview(submitted, null)).toBe(true);
  });

  it("считает опубликованный нулевой результат итоговым статусом без reviewedAt", () => {
    expect(getWorkStatus(submitted, publishedZero)).toBe("RESULT_PUBLISHED");
    expect(isAwaitingReview(submitted, publishedZero)).toBe(false);
  });

  it("не считает работу ожидающей проверки, если источник результата не дал однозначного ответа", () => {
    expect(getWorkStatus(submitted, undefined)).toBe("UNCERTAIN");
    expect(isAwaitingReview(submitted, undefined)).toBe(false);
  });

  it("учитывает отметку проверки, даже если отдельный результат не опубликован", () => {
    const reviewed = { ...submitted, reviewStatusCode: "Проверено", reviewedAt: "2026-11-10T10:00:00+06:00" };
    expect(getWorkStatus(reviewed, null)).toBe("REVIEWED");
    expect(isAwaitingReview(reviewed, null)).toBe(false);
  });

  it("распознаёт проверку по статусу, даже если дата проверки не передана", () => {
    expect(getWorkStatus({ ...submitted, reviewStatusCode: "Проверено" }, null)).toBe("REVIEWED");
  });

  it("считает работу неначатой только при подтверждённом отсутствии результата", () => {
    expect(getWorkStatus({ dataState: "READY", assignmentStatusCode: "Выдано" }, null)).toBe("NOT_STARTED");
  });

  it("не возвращает в ожидание проверки работу, отправленную на доработку", () => {
    const returned = { ...submitted, reviewStatusCode: "Возвращено на доработку" };
    expect(getWorkStatus(returned, null)).toBe("NEEDS_REVISION");
    expect(isAwaitingReview(returned, null)).toBe(false);
  });

  it("распознаёт ожидание проверки по текстовому статусу без даты отправки", () => {
    expect(getWorkStatus({ dataState: "READY", reviewStatusCode: "На проверке" }, null)).toBe("AWAITING_REVIEW");
  });

  it("не принимает отметку «Не сдано» за отправленную работу", () => {
    const notSubmitted = { ...submitted, submittedAt: undefined, submissionStatusCode: "Не сдано" };
    expect(getWorkStatus(notSubmitted, null)).toBe("NOT_SUBMITTED");
    expect(isAwaitingReview(notSubmitted, null)).toBe(false);
  });

  it("не называет работу неначатой, если источник результата недоступен", () => {
    expect(getWorkStatus({ dataState: "READY", assignmentStatusCode: "Выдано" }, undefined)).toBe("UNCERTAIN");
  });

  it("не объявляет неизвестное состояние выполнением", () => {
    expect(getWorkStatus({ dataState: "UNKNOWN" }, undefined)).toBe("UNCERTAIN");
  });

  it("отличает недоступный источник от отсутствия отметок", () => {
    expect(getWorkStatus({ dataState: "SOURCE_ERROR" }, undefined)).toBe("UNAVAILABLE");
  });
});
