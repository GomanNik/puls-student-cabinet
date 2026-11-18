import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { demoStudents } from "../../prisma/seed-data";

const id = (value: string) => encodeURIComponent(value);
function password(): string {
  return (JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] }).passwords[0];
}
async function enter(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[0].login);
  await page.getByLabel("Пароль", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}
async function subject(page: Page, title: string, period = "fall-2026") {
  const periods = (await (await page.request.get("/api/v1/periods")).json()).data.items as Array<{ periodId: string; label: string }>;
  const selected = periods.find(item => item.label.includes(period === "spring-2026" ? "Весен" : "Осен"))!;
  expect(selected).toBeTruthy();
  const offerings = (await (await page.request.get(`/api/v1/periods/${id(selected.periodId)}/offerings?limit=100`)).json()).data.items as Array<{ offeringId: string; title: string }>;
  const offering = offerings.find(item => item.title === title)!;
  expect(offering).toBeTruthy();
  return { periodId: selected.periodId, offeringId: offering.offeringId, base: `/study/${id(selected.periodId)}/${id(offering.offeringId)}` };
}

test("недельное расписание перелистывается и открывает запись исходного занятия", async ({ page }, info) => {
  await enter(page);
  await page.goto("/schedule?date=2026-11-17");
  await expect(page.getByRole("heading", { name: "Расписание", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Выберите группу, преподавателя или аудиторию" })).toBeVisible();
  await expect(page.locator(".agenda-day")).toHaveCount(0);
  const profile = (await (await page.request.get("/api/v1/profile")).json()).data as { group: string };
  await page.getByRole("searchbox", { name: "Поиск: группа" }).fill(profile.group);
  await page.getByLabel("Варианты поиска").getByRole("button", { name: new RegExp(profile.group) }).click();
  await expect(page.locator(".agenda-day")).toHaveCount(7);
  await page.getByRole("button", { name: "Следующая неделя" }).click();
  await expect(page).toHaveURL(/date=2026-11-23/);
  await expect(page.getByRole("searchbox", { name: "Поиск: группа" })).toHaveValue(profile.group);
  await page.getByRole("button", { name: "Предыдущая неделя" }).click();
  await expect(page).toHaveURL(/date=2026-11-16/);
  await expect(page.locator(".agenda-day")).toHaveCount(7);
  const list = await page.request.get("/api/v1/schedule?from=2026-11-16&to=2026-11-22");
  expect(list.status()).toBe(200);
  const first = (await list.json()).data.items[0] as { scheduleId: string; title: string };
  await page.goto(`/schedule/${id(first.scheduleId)}`);
  await expect(page.getByRole("heading", { name: first.title, level: 1 })).toBeVisible();
  await expect(page.getByText(first.title, { exact: true }).first()).toBeVisible();
  const history = await subject(page, "История России");
  const materialsResponse = await page.request.get(`/api/v1/materials?periodId=${id(history.periodId)}&offeringId=${id(history.offeringId)}&limit=100`);
  expect(materialsResponse.status()).toBe(200);
  const linked = ((await materialsResponse.json()).data.items as Array<{ title: string; relatedScheduleIds?: string[] }>).find(item => item.relatedScheduleIds?.length);
  expect(linked, "учебный источник должен содержать явно связанный материал").toBeTruthy();
  await page.goto(`/schedule/${id(linked!.relatedScheduleIds![0])}`);
  await expect(page.getByRole("heading", { name: "Материалы занятия" })).toBeVisible();
  await expect(page.getByRole("link", { name: linked!.title })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: info.outputPath("lesson-with-material-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("lesson-with-material-390.png"), fullPage: true });
});

test("три режима поиска расписания охватывают все страницы недельной выборки", async ({ page }) => {
  await enter(page);
  const endpoint = "/api/v1/schedule?from=2026-11-16&to=2026-11-22&limit=100";
  const response = await page.request.get(endpoint);
  expect(response.status()).toBe(200);
  const entries = (await response.json()).data.items as Array<{ scheduleId: string; teacherLabel: string | null; room: string | null; status: string; plannedStart: string | null }>;
  const active = entries.filter(item => item.status !== "CANCELLED");
  expect(active.length).toBeGreaterThan(1);
  let cursorRequests = 0;
  page.on("request", request => {
    if (request.url().includes("/api/v1/schedule?") && new URL(request.url()).searchParams.has("cursor")) cursorRequests++;
  });
  await page.goto("/schedule?date=2026-11-17");
  await expect(page.locator(".agenda-lesson")).toHaveCount(0);
  const profile = (await (await page.request.get("/api/v1/profile")).json()).data as { group: string };
  await page.getByRole("searchbox", { name: "Поиск: группа" }).fill(profile.group);
  await page.getByLabel("Варианты поиска").getByRole("button", { name: new RegExp(profile.group) }).click();
  await expect(page.locator(".agenda-lesson")).toHaveCount(active.length);
  expect(cursorRequests).toBeGreaterThan(0);
  const overlapPair = active.flatMap((first, index) => active.slice(index + 1).map(second => [first, second] as const))
    .find(([first, second]) => first.plannedStart && first.plannedStart === second.plannedStart);
  expect(overlapPair, "совпадающие занятия должны остаться отдельными записями").toBeTruthy();
  for (const item of overlapPair!) await expect(page.locator(`[id="lesson-${item.scheduleId}"]`)).toBeVisible();
  const target = active.find(item => item.scheduleId !== active[0].scheduleId && item.teacherLabel && item.room);
  expect(target).toBeTruthy();
  await page.getByRole("button", { name: "Преподаватель", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск: преподаватель" }).fill(target!.teacherLabel!);
  await expect(page.getByLabel("Варианты поиска").getByRole("button", { name: new RegExp(target!.teacherLabel!) })).toBeVisible();
  await page.getByLabel("Варианты поиска").getByRole("button", { name: new RegExp(target!.teacherLabel!) }).click();
  await expect(page.locator(".agenda-lesson")).toHaveCount(active.filter(item => item.teacherLabel === target!.teacherLabel).length);
  await page.getByRole("button", { name: "Аудитория", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск: аудитория" }).fill(target!.room!);
  await page.getByLabel("Варианты поиска").getByRole("button", { name: new RegExp(target!.room!) }).click();
  await expect(page.locator(".agenda-lesson")).toHaveCount(active.filter(item => item.room === target!.room).length);
  await page.getByRole("button", { name: "Группа", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск: группа" }).fill(profile.group);
  await page.getByLabel("Варианты поиска").getByRole("button", { name: new RegExp(profile.group) }).click();
  await expect(page.locator(".agenda-lesson")).toHaveCount(active.length);
  await page.getByRole("button", { name: "Очистить поиск" }).click();
  await expect(page.locator(".agenda-lesson")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Выберите группу, преподавателя или аудиторию" })).toBeVisible();
});

test("работы фильтруются, открываются без смешения с другим семестром и показывают ноль баллов", async ({ page }) => {
  test.setTimeout(60_000);
  await enter(page);
  const math = await subject(page, "Математический анализ");
  await page.goto(`${math.base}/works`);
  await expect(page.getByRole("heading", { name: "Работы и сроки", level: 1 })).toBeVisible();
  await page.getByLabel("Название").fill("Лабораторная работа № 3");
  await page.getByLabel("Показать").selectOption("RESULT");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByRole("link", { name: "Лабораторная работа № 3", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Лабораторная работа № 3", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Лабораторная работа № 3", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Даты" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Результат" })).toBeVisible();
  await expect(page.getByText("0 баллов", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Хронология учебных событий" }).click();
  await expect(page).toHaveURL(/tab=timeline/);
  // Клиентский запрос имеет таймаут 25 с: проверка ждёт его исход, не вводя задержку.
  await expect(page.locator("article.timeline-card").first()).toBeVisible({ timeout: 30_000 });
});

test("курсовой проект показывает два подтверждённых этапа, а самостоятельная единица не создаёт этапы", async ({ page }) => {
  await enter(page);
  const history = await subject(page, "История России");
  await page.goto(`${history.base}?tab=works`);
  await page.getByRole("link", { name: "Курсовой проект: исследование источников" }).click();
  await expect(page.getByRole("heading", { name: "Курсовой проект: исследование источников", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "План и источники" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Исследование и защита" })).toBeVisible();
  await page.goto("/study");
  await page.locator(".study-r9-unit").filter({ hasText: "Индивидуальный исследовательский проект" }).getByRole("link", { name: "Открыть учебную единицу" }).click();
  await expect(page.getByRole("heading", { name: "Индивидуальный исследовательский проект", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Хронология" })).toBeVisible();
});

test("текущий итог ожидается, архивный результат имеет подтверждённую дату", async ({ page }) => {
  await enter(page);
  const current = await subject(page, "Математический анализ");
  await page.goto(`${current.base}?tab=results`);
  await expect(page.getByRole("heading", { name: "Экзамен" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Официальный итог по дисциплине" }).locator("..").getByText("Ожидается")).toBeVisible();
  const archive = await subject(page, "Математический анализ", "spring-2026");
  await page.goto(`${archive.base}?tab=results`);
  await expect(page.getByRole("heading", { name: "Официальный итог по дисциплине" }).locator("..").getByText("Хорошо")).toBeVisible();
  const result = await page.request.get(`/api/v1/periods/${id(archive.periodId)}/offerings/${id(archive.offeringId)}/results`);
  expect(result.status()).toBe(200);
  expect((await result.json()).data.officialResult.assessedAt).toBeTruthy();
});

test("объявление открывается из разрешённой ленты и сохраняет исходный текст", async ({ page }) => {
  await enter(page);
  await page.goto("/announcements");
  await expect(page.getByRole("heading", { name: "Объявления", level: 1 })).toBeVisible();
  const list = await page.request.get("/api/v1/announcements");
  expect(list.status()).toBe(200);
  const item = (await list.json()).data.items[0] as { announcementId: string; title: string; body?: string };
  await page.getByRole("link", { name: item.title }).first().click();
  await expect(page.getByRole("heading", { name: item.title, level: 1 })).toBeVisible();
  if (item.body) await expect(page.getByText(item.body, { exact: true })).toBeVisible();
});

test("академический поиск в общем чате не подменяет найденную дисциплину вопросом по другой теме", async ({ page }) => {
  await enter(page);
  await page.getByRole("search").getByLabel("Задайте вопрос помощнику").fill("Найди математический анализ");
  await page.getByRole("button", { name: "Отправить вопрос" }).click();
  await expect(page).toHaveURL(/\/assistant(?:\?|$)/);
  const answer = page.getByRole("article", { name: "Ответ помощника" });
  await expect(answer.locator(".assistant-answer-text")).toContainText("Математический анализ");
  await expect(answer.getByRole("navigation", { name: "Источники ответа" }).getByRole("link").first()).toBeVisible();
  await expect(answer.locator(".assistant-answer-text")).not.toContainText("Культурное наследие России");
});
