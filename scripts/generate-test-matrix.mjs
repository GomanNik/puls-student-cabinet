import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "yaml";

const source = readFileSync("документация/04_Пользовательские_сценарии.md", "utf8");
const contract = parse(readFileSync("документация/API/Контракт_студенческого_API.yaml", "utf8"));
const aliases = {
  U1: "unit/academic-fixtures.test.ts", U2: "unit/administration-fixture.test.ts",
  U3: "unit/api-contract-inventory.test.ts", U4: "unit/calendar-export.test.ts",
  U5: "unit/gigachat-adapter.test.ts", U6: "unit/learning-assets.test.ts",
  U7: "unit/references-and-state.test.ts", U8: "unit/remote-cache.test.ts",
  I1: "integration/auth.test.ts", I2: "integration/academic-projections.test.ts",
  I3: "integration/academic-operation-isolation.test.ts", I4: "integration/student-flows.test.ts",
  I5: "integration/delivery-recovery.test.ts", I6: "integration/assistant-context.test.ts",
  I7: "integration/security-audit.test.ts", I8: "integration/grade-report.test.ts",
  E1: "e2e/auth.spec.ts", E2: "e2e/profile-resilience.spec.ts",
  E3: "e2e/student-journeys.spec.ts", E4: "e2e/academic-journeys.spec.ts",
  E5: "e2e/student-api.spec.ts", E6: "e2e/student-api-negative.spec.ts",
};
for (const file of Object.values(aliases)) if (!existsSync(`tests/${file}`)) throw Error(`Тест не найден: ${file}`);

const ft = new Map();
function mapFt(numbers, evidence) {
  for (const part of numbers.split(",")) {
    const [start, end = start] = part.split("-").map(Number);
    for (let number = start; number <= end; number++) {
      const id = `ФТ-${String(number).padStart(2, "0")}`;
      if (ft.has(id)) throw Error(`Повторная привязка ${id}`);
      ft.set(id, evidence);
    }
  }
}
mapFt("1", "E1 I1"); mapFt("2", "E2 I1"); mapFt("3-7", "E3 E5");
mapFt("8", "E4 E5"); mapFt("9-10", "U1 I2 E4"); mapFt("11-12", "I2 E4");
mapFt("13", "E3 I4"); mapFt("14", "E5 I4"); mapFt("15", "E3 I4");
mapFt("16", "E3 E5 I2"); mapFt("17-18", "E3 I4 U1");
mapFt("19-20", "E3 I4"); mapFt("21", "E3 I6"); mapFt("22", "E3 U6");
mapFt("23", "I4 E5"); mapFt("24", "U3 E5"); mapFt("25", "I3 E6");
mapFt("26", "E1 E3"); mapFt("27", "E3 E5"); mapFt("28-31", "U1 I2");
mapFt("32-34", "I2 E4"); mapFt("35-37", "E3 E5 E6");
mapFt("38-40", "I4 I5 E6"); mapFt("41-43", "E3 I4");
mapFt("44", "I2 E3"); mapFt("45-48", "U4 E5 E3");
mapFt("49-51", "E3 I4"); mapFt("52-54", "U6 E3 E6");
mapFt("55-58", "I6 U5 E3"); mapFt("59", "I4 I6");
mapFt("60", "I6 U5"); mapFt("61", "E3"); mapFt("62", "I4 E6");
mapFt("63", "U3 E5"); mapFt("64", "U1 I2"); mapFt("65", "I2 I4");
mapFt("66", "I2 I5"); mapFt("67-68", "I2 E4"); mapFt("69", "U1 E3");
mapFt("70-71", "I2 E4"); mapFt("72", "U6 E3"); mapFt("73-74", "I2 E4");
mapFt("75", "I2 U4 E3"); mapFt("76", "U1 I2 I6"); mapFt("77", "I3 E6");

const scenarios = {
  "СЦ-01": "E1 I1", "СЦ-02": "E2 I1", "СЦ-03": "E3 E5",
  "СЦ-04": "U1 I2", "СЦ-05": "E4 I2", "СЦ-06": "E4 E5",
  "СЦ-07": "E4 I2", "СЦ-08": "E3 I4", "СЦ-09": "E5 I4",
  "СЦ-10": "E3 E5 I4", "СЦ-10А": "E3 I4", "СЦ-11": "E3 I2",
  "СЦ-11.1": "U4 E3 E5", "СЦ-11.2": "U4 E5", "СЦ-11.3": "U4 E5",
  "СЦ-12": "U6 E3 E6", "СЦ-13": "E3 I4", "СЦ-13А": "E3 I4",
  "СЦ-13Б": "E3 I4", "СЦ-14": "E3 I6", "СЦ-14А": "I4 I6",
  "СЦ-15": "I3 E6", "СЦ-16": "I2 I5 I6 E2", "СЦ-17": "E1 E3",
  "СЦ-18": "E1 E3 E4", "СЦ-19": "I2 E4", "СЦ-20": "U1 E3",
  "СЦ-21": "U6 I2 E4", "СЦ-22": "I2 E4", "СЦ-23": "I2 U4 E4",
  "СЦ-24": "I2 I3 E6",
};
const partialFt = new Set([3, 4, 5, 6, 14, 18, 34, 40, 43, 51, 54, 56, 58, 63, 66, 72, 73, 74, 75, 76]);
const partialScenarios = new Set(["СЦ-03", "СЦ-09", "СЦ-11.2", "СЦ-11.3", "СЦ-12", "СЦ-16", "СЦ-23", "СЦ-24"]);
const links = evidence => evidence.split(" ").map(alias => `[${alias}](${aliases[alias]})`).join(", ");
function ensureEvidence(evidence) { for (const alias of evidence.split(" ")) if (!aliases[alias]) throw Error(`Неизвестный тест ${alias}`); }
const ftRows = [...source.matchAll(/^\| \*\*(ФТ-\d{2})\*\* \| ([^|]+) \| ([^|]+) \|/gm)]
  .map(([, id, title, scenario]) => ({ id, title: title.trim(), scenario: scenario.trim(), evidence: ft.get(id) }));
const scenarioRows = [...source.matchAll(/^## \d+\. (СЦ-\d{2}(?:[АБ]|\.[123])?)\. (.+)$/gm)]
  .map(([, id, title]) => ({ id, title: title.trim(), evidence: scenarios[id] }));
const methods = new Set(["get", "post", "head", "put", "patch", "delete"]);
const operations = Object.entries(contract.paths).flatMap(([path, verbs]) => Object.entries(verbs)
  .filter(([method]) => methods.has(method)).map(([method, operation]) => ({ method: method.toUpperCase(), path, id: operation.operationId })));
if (ftRows.length !== 77 || scenarioRows.length !== 31 || operations.length !== 50) throw Error(`Ожидалось 77/31/50, получено ${ftRows.length}/${scenarioRows.length}/${operations.length}`);
if (ft.size !== 77 || Object.keys(scenarios).length !== 31 || ftRows.some(row => !row.evidence) || scenarioRows.some(row => !row.evidence)) throw Error("В матрице есть пропущенные или лишние ID");
for (const row of [...ftRows, ...scenarioRows]) ensureEvidence(row.evidence);
const operationEvidence = ({ method, path }) => {
  if (path.startsWith("/auth/")) return "E1 I1 U3";
  if (path === "/profile") return "E2 E5 U3";
  if (path === "/periods/{periodId}/grades") return "I8 U3";
  if (path.startsWith("/materials/") && method === "HEAD") return "E6 U3";
  if (path.startsWith("/materials/")) return "E5 E6 U3";
  if (path.startsWith("/requests") || path.startsWith("/appeals")) return "E5 E6 U3";
  if (path.startsWith("/calendar")) return "E5 E6 U3";
  if (path.startsWith("/notifications")) return "E5 E3 U3";
  if (path.startsWith("/assistant")) return "E5 I6 U3";
  return "E5 U3";
};
const result = [
  "# Матрица проверок «ПУЛЬС»", "",
  "Сверена с действующим документом 04 и OpenAPI при генерации. Столбец «Тесты» указывает проверяемые аспекты, но сам по себе не доказывает выполнение всех альтернатив и критериев приёмки. `pnpm test:coverage` измеряет только Vitest; Playwright в его проценты не входит.", "",
  "Обозначения: **авто** — есть прямые автоматические проверки; **частично** — часть условий проверена, остаются перечисленные ниже пробелы; **вне MVP** — изменяющие действия ИИ запрещены; **ручная** — сценарий демонстрации жюри требует отдельного протокола.", "",
  "## 77 функциональных требований", "",
  "| ID | Требование | Сценарии | Тесты | Состояние |", "|---|---|---|---|---|",
  ...ftRows.map(row => `| ${row.id} | ${row.title} | ${row.scenario} | ${links(row.evidence)} | ${row.id === "ФТ-59" ? "вне MVP" : partialFt.has(Number(row.id.slice(3))) ? "частично" : "авто"} |`),
  "", "## 31 пользовательский сценарий", "",
  "| ID | Сценарий | Тесты | Состояние |", "|---|---|---|---|",
  ...scenarioRows.map(row => `| ${row.id} | ${row.title} | ${links(row.evidence)} | ${row.id === "СЦ-14А" ? "вне MVP" : row.id === "СЦ-18" ? "ручная" : partialScenarios.has(row.id) ? "частично" : "авто"} |`),
  "", "## 50 операций собственного API", "",
  "Все операции проверяются статическим инвентарём OpenAPI ↔ Route Handlers (`U3`). Приведённый E2E-тест вызывает соответствующий HTTP-маршрут; матрица не означает проверки всех ошибок каждой операции.", "",
  "| Метод и путь | operationId | Тесты |", "|---|---|---|",
  ...operations.map(row => `| \`${row.method} ${row.path}\` | \`${row.id}\` | ${links(operationEvidence(row))} |`),
  "", "## Подтверждённые пределы матрицы", "",
  "- Актуальные проценты Vitest V8 находятся в `coverage/vitest/coverage-summary.json` после `pnpm test:coverage`. В расчёт входят `src`, `scripts`, `prisma` и неимпортированные файлы. Playwright не входит в этот отчёт, поэтому ноль у React-экрана или Route Handler не означает отсутствия E2E-проверки.",
  "- Для частичных строк нужны адресные проверки: полные составы карточек главной; UI заявления в отличие от справки; переход каждого уведомления к исходному объекту; все варианты ошибок и неполных данных в браузере; связанные материалы и даты в нескольких представлениях; перенос срока одновременно в главной, дисциплине, календаре и трёх файлах экспорта.",
  "- Реальный GigaChat, production-инфраструктура и демонстрация жюри не подтверждаются локальными автотестами. Репетиция развёртывания проводится отдельно.",
  "",
].join("\n");
if (process.argv.includes("--check")) {
  if (!existsSync("tests/coverage-matrix.md") || readFileSync("tests/coverage-matrix.md", "utf8") !== result)
    throw Error("Матрица устарела. Запустите node scripts/generate-test-matrix.mjs и проверьте изменения.");
} else writeFileSync("tests/coverage-matrix.md", result);
console.log(`Матрица: ${ftRows.length} ФТ, ${scenarioRows.length} сценарий, ${operations.length} операций`);
