import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { demoStudents } from "../../prisma/seed-data";

test("главная соответствует композиции и открывает сохранённые маршруты", async ({ page }, info) => {
  test.setTimeout(120_000);
  await enter(page);
  const dashboard = await page.request.get("/api/v1/dashboard");
  expect(dashboard.status()).toBe(200);
  const data = (await dashboard.json()).data as { nextClasses: Array<{ title: string }>; announcements: Array<{ title: string }>; upcomingDeadlines: Array<{ title: string }>; materials: Array<{ title: string }>; calendarHighlights: Array<{ title: string }> };
  await expect(page.locator(".home-lesson-details")).toContainText(data.nextClasses[0].title);
  await expect(page.locator(".home-news-copy")).toContainText(data.announcements[0].title);
  await expect(page.locator(".home-deadline-list")).toContainText(data.upcomingDeadlines[0].title);
  await expect(page.locator(".home-material-list")).toContainText(data.materials[0].title);
  await expect(page.locator(".home-event-list")).toContainText(data.calendarHighlights[0].title);
  await expect(page.locator(".home-hero img")).toHaveAttribute("src", /home-dashboard\.jpg/);
  await expect.poll(() => page.locator(".home-hero img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator(".home-grid > .home-column")).toHaveCount(2);
  await expect(page.locator(".home-grid > .home-column").last().locator(".home-calendar")).toBeVisible();
  await expect(page.locator(".home-quick-actions, .home-notifications")).toHaveCount(0);
  await expect(page.locator(".cabinet-header .header-notifications")).toHaveAttribute("aria-label", /Уведомления/);
  await expect(page.locator(".cabinet-header .header-notification-count")).toBeVisible();
  const assistant = sidebarLink(page, "ИИ-помощник");
  await expect(assistant).toBeVisible();
  await expect(assistant).not.toContainText("Beta");
  await expect(page.getByRole("link", { name: "Открыть ИИ-помощника" })).toBeVisible();
  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Главная при ${width}px`).toBe(true);
    await page.screenshot({ path: info.outputPath(`dashboard-reference-${width}.png`), fullPage: true });
    if (width === 390) {
      await page.getByRole("button", { name: "Открыть меню" }).click();
      await expect(page.getByRole("dialog", { name: "Разделы" }).getByRole("link", { name: "ИИ-помощник" })).toBeVisible();
      await page.getByRole("button", { name: "Закрыть меню" }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await assistant.click();
  await expect(page).toHaveURL(/\/assistant$/);
  await page.goBack();
  await page.getByRole("link", { name: "Открыть ИИ-помощника" }).click();
  await expect(page).toHaveURL(/\/assistant$/);
  await page.goBack();
  for (const [selector, destination] of [
    [".home-lesson-head a", /\/schedule(?:\?date=\d{4}-\d{2}-\d{2})?$/],
    [".home-news-feature", /\/announcements\/[^/]+$/],
    [".home-material-list a", /\/materials\/[^/]+$/],
  ] as const) {
    await page.locator(selector).first().click();
    await expect(page).toHaveURL(destination);
    await page.goBack();
  }
  for (const selector of [".home-deadline-list a", ".home-event-list a"]) {
    await page.locator(selector).first().click();
    await expect(page).not.toHaveURL(/\/dashboard$/);
    await expect(page.locator("main#main")).toBeVisible();
    await page.goBack();
  }
});

function sidebarLink(page: Page, label: string) {
  return page.getByRole("navigation", { name: "Разделы кабинета" }).getByRole("link", { name: label });
}

function demoPassword() {
  return (JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] }).passwords[0];
}
async function enter(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[0].login);
  await page.getByLabel("Пароль", { exact: true }).fill(demoPassword());
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.locator("main#main").getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
}

test("контрольные снимки разделов 1440 и 390 px без горизонтального переполнения", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Вход в аккаунт" })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`login-${width}.png`), fullPage: true });
    await enter(page);
    for (const [name, route, ready] of [
      ["dashboard", "/dashboard", ".home-next-lesson"],
      ["schedule", "/schedule?date=2026-11-17", ".agenda-context"],
      ["study", "/study", ".study-r9-section"],
      ["materials", "/materials", ".catalog-layout"],
      ["requests", "/requests", ".operation-form-card"],
      ["appeals", "/appeals", ".operation-layout"],
      ["notifications", "/notifications", ".notification-r9-panel"],
      ["calendar", "/calendar", ".calendar-mode-month"],
      ["assistant", "/assistant", ".assistant-chat-header"],
      ["profile", "/profile", ".profile-identity"],
      ["announcements", "/announcements", ".community-r9-list"],
    ] as const) {
      await page.goto(route);
      await expect(page.locator(ready).first()).toBeVisible();
      if (name === "dashboard") {
        const lessonOverlap = await page.locator(".home-lesson-time").evaluate(element => {
          const range = document.createRange();
          range.selectNodeContents(element.querySelector("strong")!);
          return range.getBoundingClientRect().right - element.getBoundingClientRect().right;
        });
        expect(lessonOverlap, `Время занятия не должно заходить на разделитель при ${width}px`).toBeLessThanOrEqual(-4);
      }
      if (name !== "assistant" && name !== "profile") {
        await expect.poll(() => page.locator(".page-hero img").first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), { message: `Баннер ${name} должен загрузиться` }).toBe(true);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} at ${width}px`).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    }
    await context.close();
  }
  expect(errors).toEqual([]);
});

test("основные разделы сохраняют разметку на промежуточных ширинах", async ({ browser }) => {
  test.setTimeout(360_000);
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Вход в аккаунт" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `login at ${width}px`).toBe(true);
    await enter(page);
    for (const [name, route, ready] of [
      ["dashboard", "/dashboard", ".home-next-lesson"],
      ["schedule", "/schedule?date=2026-11-17", ".agenda-context"],
      ["study", "/study", ".study-r9-section"],
      ["materials", "/materials", ".catalog-layout"],
      ["requests", "/requests", ".operation-form-card"],
      ["appeals", "/appeals", ".operation-layout"],
      ["notifications", "/notifications", ".notification-r9-panel"],
      ["calendar", "/calendar", ".calendar-mode-month"],
      ["assistant", "/assistant", ".assistant-chat-header"],
      ["profile", "/profile", ".profile-identity"],
      ["announcements", "/announcements", ".community-r9-list"],
    ] as const) {
      await page.goto(route);
      await expect(page.locator(ready).first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: `${name} at ${width}px` }).toBe(true);
    }
    expect(errors, `JavaScript at ${width}px`).toEqual([]);
    await context.close();
  }
});

test("формы и страницы деталей используют общую композицию", async ({ browser }, info) => {
  test.setTimeout(180_000);
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await enter(page);
    for (const [name, route] of [
      ["request-new", "/requests/new?type=DEMO_CERTIFICATE"],
      ["appeal-new", "/appeals/new"],
    ] as const) {
      await page.goto(route);
      await expect(page.locator(".page-hero h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} at ${width}px`).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    }
    await page.goto("/study");
    await page.locator(".study-r9-grid .study-r9-card a").first().click();
    await expect(page).toHaveURL(/\/study\/[^/]+\/[^/?]+(?:\?|$)/);
    await expect(page.locator(".page-hero h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `discipline at ${width}px`).toBe(true);
    await page.screenshot({ path: info.outputPath(`discipline-${width}.png`), fullPage: true });
    await page.goto("/materials");
    await page.locator(".catalog-row").first().click();
    await expect(page).toHaveURL(/\/materials\/[^/?]+(?:\?|$)/);
    await expect(page.locator(".page-hero h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `material detail at ${width}px`).toBe(true);
    await page.screenshot({ path: info.outputPath(`material-detail-${width}.png`), fullPage: true });
    await page.goto("/announcements");
    await page.locator(".community-r9-list .record-card h2 a").first().click();
    await expect(page).toHaveURL(/\/announcements\/[^/?]+(?:\?|$)/);
    await expect(page.locator(".community-detail-panel h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `announcement detail at ${width}px`).toBe(true);
    await page.screenshot({ path: info.outputPath(`announcement-detail-${width}.png`), fullPage: true });
    await page.goto("/calendar?eventKinds=UNIVERSITY&view=list");
    await page.locator(".calendar-card h3 a").first().click({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/calendar\/events\/[^/?]+\?on=/);
    await expect(page.locator(".community-detail-panel h1")).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть связанный объект" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `calendar event at ${width}px`).toBe(true);
    await page.screenshot({ path: info.outputPath(`calendar-event-${width}.png`), fullPage: true });
    expect(errors, `JavaScript at ${width}px`).toEqual([]);
    await context.close();
  }
});

test("мобильное меню, история заявок и экспорт сохраняют читаемую композицию", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enter(page);

  await page.getByRole("button", { name: "Ещё" }).click();
  const menu = page.getByRole("dialog", { name: "Разделы" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Заявления и справки" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("mobile-menu-390.png"), fullPage: true });
  await menu.getByRole("button", { name: "Закрыть меню" }).click();

  await page.goto("/requests/new?type=DEMO_CERTIFICATE");
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page).toHaveURL(/\/requests\/[^/?]+$/);
  await page.goto("/requests");
  await page.getByRole("tab", { name: "Мои заявки" }).click();
  await expect(page.getByRole("tabpanel", { name: "Мои заявки" }).locator(".operation-row").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("requests-history-390.png"), fullPage: true });

  await page.goto("/calendar");
  await page.getByRole("button", { name: "Экспорт календаря" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Экспорт календаря" });
  await expect(exportDialog.getByText("Событий в полной выборке:")).toBeVisible();
  await expect(exportDialog.getByRole("option", { name: /ICS/ })).toHaveCount(1);
  await expect(exportDialog.getByRole("option", { name: /PDF/ })).toHaveCount(1);
  await expect(exportDialog.getByRole("option", { name: /XLSX/ })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("calendar-export-390.png"), fullPage: true });
  await exportDialog.getByRole("button", { name: "Закрыть" }).click();

  await page.goto("/assistant");
  await page.getByLabel("Ваш вопрос", { exact: true }).fill("Покажи мои уведомления");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.getByRole("log", { name: "Переписка с помощником ПУЛЬС" }).locator(".assistant-answer-text")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("assistant-thread-390.png"), fullPage: true });
  expect(errors).toEqual([]);
  await context.close();
});
