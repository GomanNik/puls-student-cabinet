import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { demoStudents } from "../../prisma/seed-data";
import { contractAccepts } from "../support/contract";
import { localDay } from "../../src/shared/lib/dates";

const fixture = () => JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] };
const id = (value: string) => encodeURIComponent(value);
async function enter(page: Page, account = 0) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[account].login);
  await page.getByLabel("Пароль", { exact: true }).fill(fixture().passwords[account]);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}
async function get(page: Page, path: string, schema: string) {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.status(), path).toBe(200);
  expect(response.headers()["cache-control"], path).toContain("no-store");
  const body = await response.json();
  expect(contractAccepts(schema, body), `${path} vs ${schema}`).toBe(true);
  return body.data;
}

test("основные чтения Student API соответствуют OpenAPI и разрешённому контексту", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);
  const profile = await get(page, "/profile", "ProfileResponse");
  expect(profile.fullName).toBe(demoStudents[0].fullName);
  await get(page, "/dashboard", "DashboardResponse");
  const periods = await get(page, "/periods", "PeriodListResponse");
  const period = periods.items.find((item: { isCurrent: boolean }) => item.isCurrent) ?? periods.items[0];
  expect(period).toBeTruthy();
  const p = id(period.periodId);
  const offerings = await get(page, `/periods/${p}/offerings`, "OfferingListResponse");
  const units = await get(page, `/periods/${p}/academic-units`, "UnitListResponse");
  expect(offerings.items.length).toBeGreaterThan(0);
  const offering = id(offerings.items[0].offeringId);
  const prefix = `/periods/${p}/offerings/${offering}`;
  await get(page, prefix, "OfferingDetailResponse");
  await get(page, `${prefix}/sessions`, "SessionListResponse");
  const works = await get(page, `${prefix}/works`, "WorkListResponse");
  if (works.items.length) await get(page, `${prefix}/works/${id(works.items[0].workId)}`, "WorkDetailResponse");
  await get(page, `${prefix}/timeline`, "TimelineListResponse");
  await get(page, `${prefix}/results`, "ResultsResponse");
  await get(page, `${prefix}/attestations`, "AttestationsResponse");
  if (units.items.length) {
    const unit = id(units.items[0].unitId), base = `/periods/${p}/academic-units/${unit}`;
    await get(page, base, "UnitDetailResponse");
    const unitWorks = await get(page, `${base}/works`, "WorkListResponse");
    if (unitWorks.items.length) await get(page, `${base}/works/${id(unitWorks.items[0].workId)}`, "WorkDetailResponse");
    await get(page, `${base}/timeline`, "TimelineListResponse");
  }
  const schedule = await get(page, "/schedule?from=2026-11-01&to=2026-11-30", "ScheduleListResponse");
  expect(schedule.items.length).toBeGreaterThan(0);
  await get(page, `/schedule/${id(schedule.items[0].scheduleId)}`, "ScheduleDetailResponse");
  await get(page, "/academic/search?q=математический", "SearchResponse");
  const materials = await get(page, "/materials", "MaterialListResponse");
  expect(materials.items.length).toBeGreaterThan(0);
  await get(page, `/materials/${id(materials.items[0].materialId)}`, "MaterialDetailResponse");
  const file = materials.items.find((item: { kind: string }) => item.kind === "FILE");
  expect(file).toBeTruthy();
  const download = await page.request.get(`/api/v1/materials/${id(file.materialId)}/download`);
  expect(download.status()).toBe(200);
  expect((await download.body()).length).toBeGreaterThan(0);
  const types = await get(page, "/requests/types", "RequestTypeListResponse");
  expect(types.length).toBeGreaterThan(0);
  await get(page, `/requests/types/${id(types[0].requestTypeCode)}`, "RequestTypeDetailResponse");
  await get(page, "/requests", "RequestListResponse");
  await get(page, "/appeals", "AppealListResponse");
  const notifications = await get(page, "/notifications", "NotificationListResponse");
  expect(notifications.items.length).toBeGreaterThan(0);
  await get(page, `/notifications/${id(notifications.items[0].notificationKey)}`, "NotificationDetailResponse");
  const announcements = await get(page, "/announcements", "AnnouncementListResponse");
  expect(announcements.items.length).toBeGreaterThan(0);
  await get(page, `/announcements/${id(announcements.items[0].announcementId)}`, "AnnouncementDetailResponse");
  const calendar = await get(page, "/calendar?from=2026-11-01&to=2026-11-30", "CalendarListResponse");
  expect(calendar.items.length).toBeGreaterThan(0);
  const event = calendar.items[0], on = event.starts.on ?? localDay(event.starts.at, event.starts.timeZone);
  await get(page, `/calendar/events/${id(event.eventKey)}?on=${on}`, "CalendarEventResponse");
});

test("команды API, повтор отправки и экспорт трёх форматов", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, 1);
  const origin = process.env.APP_ORIGIN!;
  async function post(path: string, data: unknown, key?: string) {
    return page.request.post(`/api/v1${path}`, { data, headers: { Origin: origin, ...(key ? { "Idempotency-Key": key } : {}) } });
  }
  const requestKey = randomUUID();
  const requestInput = { requestTypeCode: "DEMO_CERTIFICATE", formSchemaVersion: "v1", submittedData: { copies: 1 } };
  const created = await post("/requests", requestInput, requestKey);
  expect(created.status()).toBe(201);
  const request = (await created.json()).data;
  expect(contractAccepts("RequestDetailResponse", await created.json())).toBe(true);
  expect((await post("/requests", requestInput, requestKey)).status()).toBe(200);
  await get(page, `/requests/${id(request.id)}`, "RequestDetailResponse");
  await get(page, `/requests/${id(request.id)}/status`, "RequestStatusResponse");
  const resolved = await post("/operations/resolve", { operationScope: "CREATE_REQUEST", idempotencyKey: requestKey });
  expect(resolved.status()).toBe(200);
  expect(contractAccepts("ResolveResponse", await resolved.json())).toBe(true);
  const appealKey = randomUUID();
  const appeal = await post("/appeals", { categoryCode: "QUESTION", subject: "Проверка обращения", firstMessage: "Здравствуйте! Подскажите порядок консультации." }, appealKey);
  expect(appeal.status()).toBe(201);
  expect(contractAccepts("AppealDetailResponse", await appeal.json())).toBe(true);
  const appealId = (await appeal.json()).data.appeal.id;
  await get(page, `/appeals/${id(appealId)}`, "AppealDetailResponse");
  await get(page, `/appeals/${id(appealId)}/messages`, "MessageListResponse");
  const message = await post(`/appeals/${id(appealId)}/messages`, { body: "Спасибо, уточните время встречи." }, randomUUID());
  expect(message.status()).toBe(201);
  expect(contractAccepts("MessageDetailResponse", await message.json())).toBe(true);
  const feed = await get(page, "/notifications", "NotificationListResponse");
  const marked = await post("/notifications/read", { notificationKeys: [feed.items[0].notificationKey] });
  expect(marked.status()).toBe(200);
  expect(contractAccepts("ReadResponse", await marked.json())).toBe(true);
  const all = await post("/notifications/read-all", {});
  expect(all.status()).toBe(200);
  expect(contractAccepts("ReadAllResponse", await all.json())).toBe(true);
  const assistant = await post("/assistant/ask", { message: "Покажи мои уведомления", contextHint: "NOTIFICATIONS" });
  expect(assistant.status()).toBe(200);
  expect(contractAccepts("AssistantResponse", await assistant.json())).toBe(true);
  const query = "from=2026-11-01&to=2026-11-30&eventKinds=UNIVERSITY,ACADEMIC";
  const preview = await get(page, `/calendar/export-preview?${query}`, "CalendarPreviewResponse");
  for (const [format, mime, magic] of [["ics", "text/calendar", "BEGIN:VCALENDAR"], ["pdf", "application/pdf", "%PDF-"], ["xlsx", "spreadsheetml", "PK"]]) {
    const response = await page.request.get(`/api/v1/calendar/export?${query}&format=${format}&selectionToken=${encodeURIComponent(preview.selectionToken)}`);
    expect(response.status(), format).toBe(200);
    expect(response.headers()["content-type"]).toContain(mime);
    expect((await response.body()).subarray(0, magic.length).toString()).toBe(magic);
  }
});
