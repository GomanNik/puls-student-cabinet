import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { demoStudents } from "../../prisma/seed-data";

function passwords(): [string, string] {
  return (JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] }).passwords;
}
async function enter(page: Page, account = 0) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[account].login);
  await page.getByLabel("Пароль", { exact: true }).fill(passwords()[account]);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.locator("main#main").getByRole("heading", { name: /^Добрый день/, level: 1 })).toBeVisible({ timeout: 20_000 });
}
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Разделы кабинета" });

test("переходы по основным разделам сохраняют клиентскую сессию и ранее прочитанные данные", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page);
  let sessionChecks = 0;
  page.on("request", request => { if (request.url().endsWith("/api/v1/auth/me")) sessionChecks++; });
  for (const [link, heading] of [
    ["Расписание", "Расписание"], ["Учёба", "Учёба"], ["Материалы", "Материалы"],
    ["Заявления и справки", "Заявления и справки"], ["Обращения", "Обращения"],
    ["Календарь", "Календарь"], ["Уведомления", "Уведомления"],
  ]) {
    await sidebar(page).getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Разделы кабинета" }).getByRole("link", { name: link, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await sidebar(page).getByRole("link", { name: "Заявления и справки" }).click();
  await expect(page).toHaveURL(/\/requests(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Заявления и справки", level: 1 })).toBeVisible();
  await expect(page.getByText("Загружаем сведения…")).toHaveCount(0);
  expect(sessionChecks).toBe(0);
});

test("поиск материала догружает остальные страницы каталога по запросу", async ({ page }) => {
  await enter(page);
  await page.goto("/materials");
  await expect(page.locator(".catalog-row").first()).toBeVisible();
  await page.getByRole("searchbox", { name: "Поиск по названию" }).fill("Наблюдения");
  await expect(page.locator(".catalog-row").filter({ hasText: "Наблюдения.xlsx" }).first()).toBeVisible();
  await page.getByLabel("Формат").selectOption("XLSX");
  await expect(page.locator(".catalog-row").first()).toContainText("Наблюдения.xlsx");
});

test("ошибка догрузки материалов не вызывает повторные запросы без действия студента", async ({ page }) => {
  await enter(page);
  await page.goto("/materials");
  await expect(page.locator(".catalog-row").first()).toBeVisible();
  let attempts = 0;
  await page.route("**/api/v1/materials?*", async route => {
    if (!new URL(route.request().url()).searchParams.has("cursor")) return route.continue();
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SOURCE_UNAVAILABLE" } }) });
    return route.continue();
  });
  await page.getByRole("searchbox", { name: "Поиск по названию" }).fill("Наблюдения");
  await expect(page.getByRole("alert").filter({ hasText: "Уже загруженные записи сохранены" })).toBeVisible();
  await page.waitForTimeout(800);
  expect(attempts).toBe(1);
  await page.getByRole("button", { name: "Продолжить поиск" }).click();
  await expect(page.locator(".catalog-row").filter({ hasText: "Наблюдения.xlsx" }).first()).toBeVisible();
});

test("форма справки создаёт запись и показывает историю без вымышленного официального статуса", async ({ page }) => {
  await enter(page);
  await sidebar(page).getByRole("link", { name: "Заявления и справки" }).click();
  await page.getByRole("link", { name: /Выбрать форму/ }).first().click();
  await expect(page.getByRole("heading", { name: /Справка об обучении/, level: 1 })).toBeVisible();
  await expect(page.getByText("Демонстрационные формы.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page).toHaveURL(/\/requests\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "Справка об обучении", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "История статусов" })).toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();
  const detail = await page.request.get(new URL(page.url()).pathname.replace(/^/, "/api/v1"));
  expect(detail.status()).toBe(200);
  expect((await detail.json()).data.businessStatus).toBeNull();
});

test("обращение, ответ студента и обновление переписки проходят через формы", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, 1);
  await sidebar(page).getByRole("link", { name: "Обращения" }).click();
  await page.getByRole("link", { name: "Создать обращение" }).click();
  await page.getByLabel("Тема").fill("Вопрос по демонстрационному расписанию");
  await page.getByLabel("Сообщение", { exact: true }).fill("Здравствуйте! Подскажите, как уточнить время консультации?");
  await page.getByRole("button", { name: "Отправить обращение" }).click();
  await expect(page).toHaveURL(/\/appeals\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: "Вопрос по демонстрационному расписанию", level: 1 })).toBeVisible();
  await expect(page.getByText("Здравствуйте! Подскажите, как уточнить время консультации?", { exact: true })).toBeVisible();
  await page.getByLabel("Ваше сообщение").fill("Спасибо, пришлите, пожалуйста, дату и время встречи.");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.getByText("Спасибо, пришлите, пожалуйста, дату и время встречи.", { exact: true })).toBeVisible();
  const message = page.locator(".message").filter({ hasText: "Спасибо, пришлите, пожалуйста, дату и время встречи." });
  await expect(message.locator(".message-delivery")).toContainText("Ожидает передачи");
  execFileSync(process.execPath, ["--conditions=react-server", "--import=tsx", "--eval", "import('./src/modules/operations/worker.ts').then(async ({ administrationTick }) => { await administrationTick(); process.exit(0); }).catch(error => { console.error(error); process.exit(1); })"], { windowsHide: true, timeout: 30_000 });
  await expect(message.locator(".message-delivery")).toHaveText("Передача подтверждена", { timeout: 15_000 });
  await page.getByRole("button", { name: "Обновить переписку" }).click();
  await expect(page.getByText("Спасибо, пришлите, пожалуйста, дату и время встречи.", { exact: true })).toBeVisible();
});

test("уведомления фильтруются и отдельная отметка прочтения сохраняется", async ({ page }) => {
  await enter(page);
  const bell = page.locator(".cabinet-header .header-notifications");
  await expect(bell).toHaveAttribute("aria-label", /Уведомления, непрочитанных: \d+/);
  const before = Number((await bell.getAttribute("aria-label"))?.match(/\d+/)?.[0]);
  await sidebar(page).getByRole("link", { name: "Уведомления" }).click();
  await expect(page.getByRole("heading", { name: "Уведомления", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Непрочитанные" }).click();
  const first = page.getByRole("button", { name: "Отметить прочитанным" }).first();
  await expect(first).toBeVisible();
  const reply = page.waitForResponse(response => response.url().endsWith("/api/v1/notifications/read") && response.request().method() === "POST");
  await first.click();
  expect((await reply).status()).toBe(200);
  await expect.poll(async () => Number((await bell.getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? 0)).toBe(before - 1);
  await expect(page.getByRole("heading", { name: "Уведомления", level: 1 })).toBeVisible();
  await page.reload();
  await expect.poll(async () => Number((await bell.getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? 0)).toBe(before - 1);
  await expect(page.getByRole("button", { name: "Все", exact: true })).toHaveAttribute("aria-pressed", "true");
  const feed = await page.request.get("/api/v1/notifications?unreadOnly=false");
  expect(feed.status()).toBe(200);
  expect((await feed.json()).data.items.some((item: { isRead: boolean }) => item.isRead)).toBe(true);
});

test("помощник получает вопрос из шапки, показывает ответ и очищает локальную переписку", async ({ page }) => {
  test.setTimeout(60_000);
  await enter(page);
  await page.getByRole("search").getByLabel("Задайте вопрос помощнику").fill("Покажи мои уведомления");
  await page.getByRole("button", { name: "Отправить вопрос" }).click();
  await expect(page).toHaveURL(/\/assistant(?:\?|$)/);
  const chat = page.getByRole("log", { name: "Переписка с помощником ПУЛЬС" });
  await expect(chat.getByRole("article", { name: "Ваш вопрос" })).toContainText("Покажи мои уведомления");
  await expect(chat.getByRole("article", { name: "Ответ помощника" })).toContainText("ПУЛЬС");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Очистить" }).click();
  await expect(page.getByLabel("Переписка пока пуста")).toBeVisible();
});

test("диалог помощника восстанавливается после обновления вкладки и очищается при смене аккаунта", async ({ page }) => {
  test.setTimeout(60_000);
  await enter(page, 0);
  await sidebar(page).getByRole("link", { name: "Учёба" }).click();
  await page.getByRole("button", { name: "Открыть чат с помощником" }).click();
  await expect(page).toHaveURL(/\/assistant(?:\?|$)/);
  await page.getByLabel("Ваш вопрос").fill("Покажи мои уведомления");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(page.getByRole("article", { name: "Ответ помощника" }).locator(".assistant-answer-text")).not.toBeEmpty();
  await page.reload();
  await expect(page.getByRole("article", { name: "Ваш вопрос" })).toContainText("Покажи мои уведомления");
  await page.getByRole("complementary").getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await enter(page, 1);
  await page.goto("/assistant");
  await expect(page.getByLabel("Переписка пока пуста")).toBeVisible();
  await expect(page.getByText("Покажи мои уведомления", { exact: true })).toHaveCount(0);
});

test("учебные сведения и PDF-материал читаются на мобильном экране", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await enter(page);
  await page.getByRole("navigation", { name: "Быстрая навигация" }).getByRole("link", { name: "Учёба" }).click();
  const discipline = page.getByRole("link", { name: /Открыть дисциплину/ }).first();
  await expect(discipline).toBeVisible();
  await discipline.click();
  await page.getByRole("navigation", { name: "Разделы дисциплины" }).getByRole("link", { name: "Занятия" }).click();
  await expect(page.getByText("План и проведение — разные факты.", { exact: false })).toBeVisible();
  await expect(page.getByText("Ваша посещаемость").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/materials");
  const link = page.locator(".catalog-row").filter({ hasText: "Конспект.pdf" }).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading", { name: "Конспект.pdf", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("календарь не принимает обратный диапазон и открывает подтверждённый экспорт", async ({ page }) => {
  await enter(page);
  await sidebar(page).getByRole("link", { name: "Календарь" }).click();
  await expect(page.getByRole("heading", { name: "Календарь", level: 1 })).toBeVisible();
  await page.goto("/calendar?from=2026-11-30&to=2026-11-01&view=list");
  await expect(page.getByRole("status").filter({ hasText: "Диапазон из адреса некорректен. Показан текущий месяц." })).toBeVisible();
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await page.getByLabel("С", { exact: true }).fill("2026-11-30");
  await page.getByLabel("По", { exact: true }).fill("2026-11-01");
  await page.getByRole("button", { name: "Показать" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Начало диапазона должно быть не позже окончания" })).toBeVisible();
  await page.getByLabel("С", { exact: true }).fill("2026-11-01");
  await page.getByLabel("По", { exact: true }).fill("2026-11-30");
  await page.getByRole("button", { name: "Показать" }).click();
  await page.getByRole("button", { name: "Экспорт календаря" }).click();
  const dialog = page.getByRole("dialog", { name: "Экспорт календаря" });
  await expect(dialog.getByText("Событий в полной выборке:", { exact: false })).toBeVisible();
  await dialog.getByLabel("Формат").selectOption("ics");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Скачать выбранную выборку" }).click();
  expect((await download).suggestedFilename()).toBe("puls-calendar.ics");
  await dialog.getByRole("button", { name: "Закрыть" }).click();
  await expect(dialog).toBeHidden();
});

test("на ширине 360 px разделы доступны с клавиатуры и нет горизонтального переполнения", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enter(page);
  await page.getByRole("button", { name: "Ещё" }).click();
  const menu = page.getByRole("dialog", { name: "Разделы" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Заявления и справки" }).click();
  await expect(page.getByRole("heading", { name: "Заявления и справки", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Ещё" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Ещё" })).toBeFocused();
  expect(errors).toEqual([]);
});
