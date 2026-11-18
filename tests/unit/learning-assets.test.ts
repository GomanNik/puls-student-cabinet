import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { fixtureMaterialContent, learningAssets } from "@/server/integrations/learning-assets";

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
