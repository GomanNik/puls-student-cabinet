import { test, expect, request as apiRequest, type APIResponse, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { demoStudents } from "../../prisma/seed-data";

const certificate = { requestTypeCode: "DEMO_CERTIFICATE", formSchemaVersion: "v1", submittedData: { copies: 1 } };
const path = (value: string) => encodeURIComponent(value);
function passwords(): [string, string] {
  return (JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] }).passwords;
}
async function login(page: Page, index: number) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[index].login);
  await page.getByLabel("Пароль", { exact: true }).fill(passwords()[index]);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}
function headers(key?: string) { return { Origin: process.env.APP_ORIGIN!, ...(key ? { "Idempotency-Key": key } : {}) }; }
async function code(response: APIResponse) {
  return ((await response.json()) as { error?: { code?: string } }).error?.code;
}

test("защищённые чтения и команды без сессии не раскрывают данные", async ({ page }) => {
  for (const target of ["/profile", "/dashboard", "/periods", "/schedule?from=2026-11-01&to=2026-11-30", "/materials", "/requests", "/appeals", "/notifications", "/calendar?from=2026-11-01&to=2026-11-30"]) {
    const response = await page.request.get(`/api/v1${target}`);
    expect(response.status(), target).toBe(401);
    expect(response.headers()["cache-control"], target).toContain("no-store");
  }
  for (const [target, body] of [["/requests", certificate], ["/assistant/ask", { message: "Покажи расписание" }]] as const) {
    const response = await page.request.post(`/api/v1${target}`, { headers: headers(randomUUID()), data: body });
    expect(response.status(), target).toBe(401);
  }
});

test("изменяющие запросы требуют доверенного Origin, JSON и корректного тела", async ({ page }) => {
  await login(page, 0);
  const target = "/api/v1/requests", key = randomUUID();
  const foreign = await page.request.post(target, { headers: { ...headers(key), Origin: "https://attacker.invalid" }, data: certificate });
  expect(foreign.status()).toBe(403);
  expect(await code(foreign)).toBe("CSRF_ORIGIN_INVALID");
  const missing = await page.request.post(target, { headers: { "Idempotency-Key": key }, data: certificate });
  expect(missing.status()).toBe(403);
  const wrongMedia = await page.request.post(target, { headers: { ...headers(key), "Content-Type": "text/plain" }, data: JSON.stringify(certificate) });
  expect(wrongMedia.status()).toBe(415);
  const duplicate = await page.request.post(target, { headers: { ...headers(key), "Content-Type": "application/json" }, data: '{"requestTypeCode":"DEMO_CERTIFICATE","requestTypeCode":"DEMO_APPLICATION","formSchemaVersion":"v1","submittedData":{"copies":1}}' });
  expect(duplicate.status()).toBe(400);
  const oversized = await page.request.post(target, { headers: headers(key), data: { ...certificate, filler: "x".repeat(33_000) } });
  expect(oversized.status()).toBe(413);
  const malformed = await page.request.post(target, { headers: headers(key), data: { requestTypeCode: "DEMO_CERTIFICATE", formSchemaVersion: "v1", submittedData: { copies: 0 } } });
  expect(malformed.status()).toBe(422);
  const noKey = await page.request.post(target, { headers: headers(), data: certificate });
  expect(noKey.status()).toBe(422);
});

test("списки отвергают повторяющиеся, подменённые и выходящие за лимит параметры", async ({ page }) => {
  await login(page, 0);
  for (const target of ["/requests?limit=1&limit=2", "/requests?limit=0", "/requests?limit=101", "/requests?unknown=1", "/requests?kind=FOREIGN", "/appeals?cursor=bogus"]) {
    const response = await page.request.get(`/api/v1${target}`);
    expect(response.status(), target).toBe(422);
    expect(await code(response), target).toBe("VALIDATION_ERROR");
  }
});

test("один ключ отправки не может создать другую заявку и повтор не создаёт дубль", async ({ page }) => {
  await login(page, 0);
  const key = randomUUID(), target = "/api/v1/requests";
  const first = await page.request.post(target, { headers: headers(key), data: certificate });
  expect(first.status()).toBe(201);
  const id = (await first.json()).data.id as string;
  const replay = await page.request.post(target, { headers: headers(key), data: certificate });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).data.id).toBe(id);
  const conflict = await page.request.post(target, { headers: headers(key), data: { ...certificate, submittedData: { copies: 2 } } });
  expect(conflict.status()).toBe(409);
  expect(await code(conflict)).toBe("IDEMPOTENCY_CONFLICT");
  const detail = await page.request.get(`/api/v1/requests/${path(id)}`);
  expect((await detail.json()).data.submittedData.copies).toBe(1);
});

test("подмена идентификаторов заявок и обращений между браузерными сессиями закрыта", async ({ browser }) => {
  test.setTimeout(60_000);
  const left = await browser.newContext({ baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
  const right = await browser.newContext({ baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
  try {
    const a = await left.newPage(), b = await right.newPage();
    await login(a, 0); await login(b, 1);
    const request = await b.request.post("/api/v1/requests", { headers: headers(randomUUID()), data: certificate });
    expect(request.status()).toBe(201);
    const requestId = (await request.json()).data.id as string;
    const appeal = await b.request.post("/api/v1/appeals", { headers: headers(randomUUID()), data: { categoryCode: "QUESTION", subject: "Закрытый вопрос", firstMessage: "Это обращение второго студента." } });
    expect(appeal.status()).toBe(201);
    const appealId = (await appeal.json()).data.appeal.id as string;
    for (const target of [`/requests/${path(requestId)}`, `/requests/${path(requestId)}/status`, `/appeals/${path(appealId)}`, `/appeals/${path(appealId)}/messages`]) {
      expect((await a.request.get(`/api/v1${target}`)).status(), target).toBe(404);
    }
    const forged = await a.request.post(`/api/v1/appeals/${path(appealId)}/messages`, { headers: headers(randomUUID()), data: { body: "Чужая переписка недоступна." } });
    expect(forged.status()).toBe(404);
    expect((await b.request.get(`/api/v1/requests/${path(requestId)}`)).status()).toBe(200);
    expect((await b.request.get(`/api/v1/appeals/${path(appealId)}`)).status()).toBe(200);
  } finally { await left.close(); await right.close(); }
});

test("файл отдаётся с ограничениями HEAD и Range, чужой материал недоступен", async () => {
  test.setTimeout(45_000);
  const left = await apiRequest.newContext({ baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
  const right = await apiRequest.newContext({ baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
  try {
    for (const [context, index] of [[left, 0], [right, 1]] as const) {
      const response = await context.post("/api/v1/auth/login", { headers: headers(), data: { login: demoStudents[index].login, password: passwords()[index] }, timeout: 10_000 });
      expect(response.status()).toBe(200);
    }
    const list = await test.step("список материалов B", () => right.get("/api/v1/materials", { timeout: 10_000 }), { timeout: 12_000 });
    expect(list.status()).toBe(200);
    const file = (await list.json()).data.items.find((item: { kind: string }) => item.kind === "FILE");
    expect(file).toBeTruthy();
    const url = `/api/v1/materials/${path(file.materialId)}/download`;
    expect((await test.step("чужой файл", () => left.get(url, { timeout: 10_000 }), { timeout: 12_000 })).status()).toBe(404);
    const head = await test.step("HEAD файла B", () => right.head(url, { timeout: 10_000 }), { timeout: 12_000 });
    expect(head.status()).toBe(200);
    expect(head.headers()["accept-ranges"]).toBe("none");
    expect(head.headers()["content-disposition"]).toContain("attachment");
    expect((await test.step("Range файла B", () => right.get(url, { headers: { Range: "bytes=0-10" }, timeout: 10_000 }), { timeout: 12_000 })).status()).toBe(416);
    expect((await test.step("лишний параметр файла B", () => right.get(`${url}?unexpected=1`, { timeout: 10_000 }), { timeout: 12_000 })).status()).toBe(422);
  } finally { await Promise.all([left.dispose(), right.dispose()]); }
});

test("токен экспорта привязан к студенту, фильтрам и исходной выборке", async ({ browser }) => {
  test.setTimeout(60_000);
  const left = await browser.newContext({ baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
  const right = await browser.newContext({ baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
  try {
    const a = await left.newPage(), b = await right.newPage();
    await login(a, 0); await login(b, 1);
    const query = "from=2026-11-01&to=2026-11-30&eventKinds=UNIVERSITY,ACADEMIC";
    const preview = await a.request.get(`/api/v1/calendar/export-preview?${query}`);
    expect(preview.status()).toBe(200);
    const token = (await preview.json()).data.selectionToken as string;
    const exportUrl = `/api/v1/calendar/export?${query}&format=ics&selectionToken=${path(token)}`;
    const foreign = await b.request.get(exportUrl);
    expect(foreign.status()).toBe(409);
    expect(await code(foreign)).toBe("CALENDAR_SELECTION_CHANGED");
    const changed = await a.request.get(exportUrl.replace("eventKinds=UNIVERSITY,ACADEMIC", "eventKinds=ACADEMIC"));
    expect(changed.status()).toBe(409);
    const tampered = await a.request.get(exportUrl.replace(path(token), path(`${token}x`)));
    expect(tampered.status()).toBe(409);
    expect((await a.request.get(exportUrl)).status()).toBe(200);
  } finally { await left.close(); await right.close(); }
});
