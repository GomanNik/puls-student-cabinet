import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { demoStudents } from "../../prisma/seed-data";

const passwords = () => (JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] }).passwords;
const unreadCount = async (page: Page) => Number((await page.locator(".cabinet-header .header-notifications").getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? 0);
const notificationRows = (page: Page) => page.locator(".notification-r9-row");

async function enter(page: Page, account: 0 | 1) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[account].login);
  await page.getByLabel("Пароль", { exact: true }).fill(passwords()[account]);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.locator(".cabinet-header .header-notifications")).toBeVisible();
}

async function feed(page: Page) {
  const response = await page.request.get("/api/v1/notifications?unreadOnly=false&limit=100");
  expect(response.status()).toBe(200);
  return (await response.json()).data.items as Array<{ notificationKey: string; title: string; isRead: boolean; target?: object }>;
}

test("открытие сохраняет прочтение одной записи, повторное открытие не пишет в API, данные студентов разделены", async ({ page }) => {
  test.setTimeout(150_000);
  await enter(page, 1);
  const bBefore = await feed(page);
  const bUnread = bBefore.filter(item => !item.isRead).length;
  await page.getByRole("complementary").getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);

  await enter(page, 0);
  const aBefore = await feed(page);
  const selected = aBefore.find(item => !item.isRead && item.target);
  expect(selected).toBeTruthy();
  const initialCount = await unreadCount(page);
  await page.goto("/notifications");
  const row = notificationRows(page).filter({ has: page.getByRole("link", { name: selected!.title, exact: true }) }).first();
  await expect(row).toContainText("Новое");
  const saved = page.waitForResponse(response => response.url().endsWith("/api/v1/notifications/read") && response.request().method() === "POST");
  await row.getByRole("link", { name: selected!.title, exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON().notificationKeys).toEqual([selected!.notificationKey]);
  await expect(page).not.toHaveURL(/\/notifications(?:\?|$)/);
  await expect.poll(() => unreadCount(page)).toBe(initialCount - 1);

  await page.goto("/notifications");
  const readRow = notificationRows(page).filter({ has: page.getByRole("link", { name: selected!.title, exact: true }) }).first();
  await expect(readRow).toContainText("Прочитано");
  let repeatedPosts = 0;
  page.on("request", request => { if (request.url().endsWith("/api/v1/notifications/read") && request.method() === "POST") repeatedPosts++; });
  await readRow.getByRole("link", { name: selected!.title, exact: true }).click();
  await expect(page).not.toHaveURL(/\/notifications(?:\?|$)/);
  expect(repeatedPosts).toBe(0);
  const aAfter = await feed(page);
  expect(aAfter.find(item => item.notificationKey === selected!.notificationKey)?.isRead).toBe(true);
  for (const item of aBefore.filter(item => item.notificationKey !== selected!.notificationKey)) {
    expect(aAfter.find(next => next.notificationKey === item.notificationKey)?.isRead).toBe(item.isRead);
  }

  await page.getByRole("complementary").getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await enter(page, 1);
  const bAfter = await feed(page);
  expect(bAfter.filter(item => !item.isRead)).toHaveLength(bUnread);
  expect(bAfter.some(item => item.notificationKey === selected!.notificationKey)).toBe(false);
});

test("ошибка записи не подтверждает прочтение и не открывает связанный объект", async ({ page }) => {
  await enter(page, 0);
  await page.goto("/notifications");
  const row = notificationRows(page).filter({ has: page.locator(".notification-r9-arrow") }).filter({ hasText: "Новое" }).first();
  await expect(row).toBeVisible();
  const initialCount = await unreadCount(page);
  await page.route("**/api/v1/notifications/read", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "EXTERNAL_UNAVAILABLE" } }) }));
  await row.locator(".notification-r9-arrow").click();
  await expect(row.getByRole("alert")).toBeVisible();
  await expect(row).toContainText("Новое");
  await expect(page).toHaveURL(/\/notifications(?:\?|$)/);
  expect(await unreadCount(page)).toBe(initialCount);
});
