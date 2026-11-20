import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { AcademicPeriod, OfferingSummary, Material, WorkSummary, Announcement } from "../../src/shared/contracts/student-api";

const enc = encodeURIComponent;
function password(account: 0 | 1) {
  const fixture = JSON.parse(readFileSync(process.env.PULS_E2E_FIXTURE_FILE ?? ".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] };
  return fixture.passwords[account];
}
async function enter(page: Page, account: 0 | 1 = 0) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(account ? "demo-b" : "demo-a");
  await page.getByLabel("Пароль", { exact: true }).fill(password(account));
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}
async function read<T>(page: Page, path: string): Promise<T> {
  const result = await page.evaluate(async path => {
    const response = await fetch(`/api/v1${path}`);
    return { status: response.status, body: await response.json() };
  }, path);
  expect(result.status).toBe(200);
  return result.body.data as T;
}
async function subjects(page: Page) {
  const periods = await read<{ items: AcademicPeriod[] }>(page, "/periods");
  const current = periods.items.find(item => item.isCurrent)!;
  const offerings = await read<{ items: OfferingSummary[] }>(page, `/periods/${enc(current.periodId)}/offerings?limit=100`);
  return { current, offerings: offerings.items };
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1440, 360]) {
  test(`№17, 13: навигация по логотипу и возврат из объявления, ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enter(page);
    const announcements = await read<{ items: Announcement[] }>(page, "/announcements?limit=1");
    await page.goto(`/announcements/${enc(announcements.items[0].announcementId)}`);
    const back = page.getByRole("link", { name: "← Назад", exact: true });
    await expect(back).toHaveAttribute("href", "/notifications?category=ANNOUNCEMENT");
    await back.click();
    await expect(page).toHaveURL(/\/notifications\?category=ANNOUNCEMENT$/);
    const documents: string[] = [];
    page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
    if (width === 1440) await page.locator('a.brand:visible').click();
    else {
      // В существующей компоновке 360 px логотип скрыт; маршрут ссылки сохраняется.
      await expect(page.locator('.cabinet-header a.brand')).toHaveAttribute('href', '/dashboard');
      await expect(page.locator('.cabinet-header a.brand')).toBeHidden();
      await page.getByRole('navigation', { name: 'Быстрая навигация' }).getByRole('link', { name: 'Главная', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(documents).toEqual([]);
    await noOverflow(page);
  });

  test(`№14: одна активная дата, выбор и смена месяца, ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enter(page);
    await page.goto("/calendar");
    await expect(page.locator('.calendar-day-selected:enabled')).toHaveCount(1);
    const previous = await page.locator('.calendar-day-selected time').getAttribute('datetime');
    await page.locator('.calendar-day:enabled:not(.calendar-day-selected)').first().click();
    await expect(page.locator('.calendar-day-selected')).toHaveCount(1);
    await expect(page.locator('.calendar-day[aria-pressed="true"]')).toHaveCount(1);
    expect(await page.locator('.calendar-day-selected time').getAttribute('datetime')).not.toBe(previous);
    await expect(page.locator('.calendar-day-today')).toHaveCount(0);
    const month = page.getByLabel("Выберите месяц");
    const initial = await month.inputValue();
    const other = initial === "2026-12" ? "2026-11" : "2026-12";
    await month.fill(other);
    await expect(page.locator('.calendar-day-selected:enabled time')).toHaveAttribute('datetime', `${other}-01`);
    await page.locator('.calendar-day:enabled:not(.calendar-day-selected)').first().click();
    await expect(page.locator('.calendar-day-selected')).toHaveCount(1);
    await month.fill(initial);
    await expect(page.locator('.calendar-day-selected:enabled')).toHaveCount(1);
    await noOverflow(page);
  });

  test(`№11, 12: дисциплина, совместные фильтры, сброс и метаданные, ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enter(page);
    const { current, offerings } = await subjects(page);
    const selected = offerings.find(item => item.title === "История России")!;
    const scoped = await read<{ items: Material[] }>(page, `/materials?offeringId=${enc(selected.offeringId)}&limit=100`);
    expect(scoped.items.length).toBeGreaterThan(0);
    expect(scoped.items.every(item => item.offeringId === selected.offeringId)).toBe(true);
    const all = await read<{ items: Material[] }>(page, "/materials?limit=20");
    await page.goto("/materials");
    const discipline = page.getByRole("combobox", { name: "Дисциплина", exact: true });
    const period = page.getByRole("combobox", { name: "Учебный период", exact: true });
    const search = page.getByRole("searchbox", { name: "Поиск по названию" });
    const format = page.getByRole("combobox", { name: "Формат", exact: true });
    await expect(discipline).toBeEnabled();
    await expect(discipline.locator(`option[value="${selected.offeringId}"]`)).toHaveCount(1);
    await discipline.selectOption(selected.offeringId);
    await expect(page.locator('.catalog-row')).toHaveCount(scoped.items.length);
    expect((await page.locator('.catalog-row').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')!.split('/').pop()))).sort()).toEqual(scoped.items.map(item => item.materialId).sort());
    await search.fill("Конспект");
    await format.selectOption("PDF");
    await expect(page.locator('.catalog-row')).toHaveCount(scoped.items.filter(item => item.title.includes("Конспект") && item.mimeType === "application/pdf").length);
    await period.selectOption(current.periodId);
    await expect(search).toHaveValue("Конспект");
    await expect(format).toHaveValue("PDF");
    await discipline.selectOption(selected.offeringId);
    await expect(search).toHaveValue("Конспект");
    await expect(format).toHaveValue("PDF");
    await search.fill("заведомо отсутствующий материал");
    await expect(page.getByRole("heading", { name: "Подходящих материалов не найдено" })).toBeVisible();
    await page.getByRole("button", { name: "Сбросить", exact: true }).click();
    await expect(period).toHaveValue("");
    await expect(discipline).toHaveValue("");
    await expect(search).toHaveValue("");
    await expect(format).toHaveValue("");
    await expect(page.locator('.catalog-row')).toHaveCount(all.items.length);
    await discipline.selectOption(selected.offeringId);
    await expect(page.locator('.catalog-row')).toHaveCount(scoped.items.length);
    await discipline.selectOption("");
    await expect(page.locator('.catalog-row')).toHaveCount(all.items.length);
    await noOverflow(page);
    const file = scoped.items.find(item => item.mimeType === "application/pdf")!;
    await page.goto(`/materials/${enc(file.materialId)}`);
    const related = page.getByRole("link", { name: `Дисциплина: ${selected.title}`, exact: true });
    await expect(related).toBeVisible();
    await expect(page.locator('.material-card')).toContainText("Файл · PDF");
    await noOverflow(page);
    await related.click();
    await expect(page).toHaveURL(new RegExp(`/study/${enc(current.periodId)}/${enc(selected.offeringId)}$`));
  });
}

test("№11: подтверждённый пустой ответ дисциплины — штатное пустое состояние (контрольный ответ)", async ({ page }) => {
  await enter(page);
  const { offerings } = await subjects(page);
  const selected = offerings[0];
  const original = await page.evaluate(async path => {
    const response = await fetch(path);
    return { body: await response.json(), scope: response.headers.get("X-Puls-Session-Scope")! };
  }, `/api/v1/materials?offeringId=${enc(selected.offeringId)}`);
  const response = original.body;
  response.data = { ...response.data, items: [], nextCursor: null, isComplete: true, dataState: "EMPTY_CONFIRMED" };
  await page.route('**/api/v1/materials?**', route => new URL(route.request().url()).searchParams.get('offeringId') === selected.offeringId
    ? route.fulfill({ json: response, headers: { "X-Puls-Session-Scope": original.scope } }) : route.continue());
  await page.goto(`/materials?offeringId=${enc(selected.offeringId)}`);
  await expect(page.getByRole("heading", { name: "Доступных материалов пока нет" })).toBeVisible();
  await expect(page.locator('.catalog-row')).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Дисциплина", exact: true })).toHaveValue(selected.offeringId);
});

test("№1: доступные собственные группы двух аккаунтов различаются после выхода и входа", async ({ page }) => {
  const groups: string[] = [];
  for (const account of [0, 1] as const) {
    await enter(page, account);
    const profile = await read<{ group: string }>(page, "/profile");
    groups.push(profile.group);
    await page.goto("/schedule?date=2026-11-17");
    await page.getByRole("searchbox", { name: "Поиск: группа" }).fill(profile.group);
    await page.getByLabel("Варианты поиска").getByRole("button", { name: new RegExp(profile.group) }).click();
    await expect(page.locator('.agenda-day')).toHaveCount(7);
    await expect(page.getByRole("searchbox", { name: "Поиск: группа" })).toHaveValue(profile.group);
    await page.getByRole("complementary").getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  expect(groups[0]).not.toBe(groups[1]);
});

test("№2, 6: регистр подписей, история и статусы", async ({ page }) => {
  await enter(page);
  const { current, offerings } = await subjects(page);
  const selected = offerings.find(item => item.title === "Математический анализ")!;
  const base = `/study/${enc(current.periodId)}/${enc(selected.offeringId)}`;
  const apiBase = `/periods/${enc(current.periodId)}/offerings/${enc(selected.offeringId)}`;
  await page.goto(base);
  const stats = page.locator('.discipline-stats');
  await expect(stats).toContainText("Работы:");
  expect(await stats.innerText()).not.toMatch(/От\s+\d/u);
  await expect(stats).toContainText(/Работы:\s*от \d/u);
  const list = await read<{ items: WorkSummary[] }>(page, `${apiBase}/works?limit=100`);
  const submitted = list.items.find(item => item.progress?.submittedAt)!;
  expect(submitted).toBeTruthy();
  await page.goto(`/open/${enc(submitted.workId)}?kind=WORK`);
  const history = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Сроки и история', exact: true }) });
  const progress = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Выполнение и проверка', exact: true }) });
  await expect(history.getByText('Передано на проверку', { exact: true })).toBeVisible();
  await expect(progress.locator('dt', { hasText: 'Передача на проверку' })).toHaveCount(1);
  await expect(progress.locator('dd', { hasText: submitted.progress!.submissionStatusCode! })).toHaveCount(1);
});
