import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { demoStudents } from "../../prisma/seed-data";
import { localDay } from "../../src/shared/lib/dates";

const encode = (value: string) => encodeURIComponent(value);
const password = () => (JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] }).passwords[0];
async function enter(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[0].login);
  await page.getByLabel("Пароль", { exact: true }).fill(password());
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}
async function list<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.status(), path).toBe(200);
  return ((await response.json()) as { data: { items: T[] } }).data.items;
}

const imageNames = [
  "appeal-form.jpg", "appeal-thread.jpg", "appeals-list.jpg", "calendar-month.jpg",
  "chronology-history.jpg", "course-project.jpg", "discipline-history.jpg", "home-dashboard.jpg",
  "home-library.jpg", "independent-project.jpg", "lesson-study.jpg", "materials-library.jpg",
  "notifications-desk.jpg", "request-detail.jpg", "request-form.jpg", "requests-catalog.jpg",
  "results-study.jpg", "schedule-week.jpg", "study-overview.jpg", "work-notes.jpg",
];

test("все 20 изображений уникальны и доступны браузеру", async ({ page }) => {
  const files = readdirSync("public/puls").filter(name => name.endsWith(".jpg")).sort();
  expect(files).toEqual(imageNames);
  const hashes = files.map(name => createHash("sha256").update(readFileSync(`public/puls/${name}`)).digest("hex"));
  expect(new Set(hashes).size).toBe(imageNames.length);
  await page.goto("/login");
  const results = await page.evaluate(names => Promise.all(names.map(name => new Promise<{ name: string; loaded: boolean; width: number; height: number }>(resolve => {
    const image = new Image();
    image.onload = () => resolve({ name, loaded: true, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ name, loaded: false, width: 0, height: 0 });
    image.src = `/puls/${name}`;
  }))), imageNames);
  for (const result of results) {
    expect(result.loaded, result.name).toBe(true);
    expect(result.width, result.name).toBeGreaterThan(0);
    expect(result.height, result.name).toBeGreaterThan(0);
  }
});

test("вложенные экраны используют данные API и сохраняют композицию при 1440 и 390 px", async ({ browser }, info) => {
  test.setTimeout(300_000);
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, baseURL: process.env.APP_ORIGIN, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await enter(page);

    const periods = await list<{ periodId: string; label: string; isCurrent: boolean }>(page, "/periods");
    const period = periods.find(item => item.isCurrent) ?? periods[0];
    expect(period).toBeTruthy();
    const p = encode(period.periodId);
    const offerings = await list<{ offeringId: string; title: string }>(page, `/periods/${p}/offerings?limit=100`);
    const units = await list<{ unitId: string }>(page, `/periods/${p}/academic-units?limit=100`);
    expect(offerings.length).toBeGreaterThan(0);
    expect(units.length).toBeGreaterThan(0);
    const offering = encode(offerings[0].offeringId), unit = encode(units[0].unitId);
    const works = await list<{ workId: string }>(page, `/periods/${p}/offerings/${offering}/works?limit=100`);
    const history = offerings.find(item => item.title === "История России");
    expect(history).toBeTruthy();
    const historyWorks = await list<{ workId: string; title: string }>(page, `/periods/${p}/offerings/${encode(history!.offeringId)}/works?limit=100`);
    const courseProject = historyWorks.find(item => item.title.startsWith("Курсовой проект"));
    expect(courseProject).toBeTruthy();
    const archive = periods.find(item => item.label.includes("Весен"));
    expect(archive).toBeTruthy();
    const archiveOfferings = await list<{ offeringId: string; title: string }>(page, `/periods/${encode(archive!.periodId)}/offerings?limit=100`);
    const archiveMath = archiveOfferings.find(item => item.title === "Математический анализ");
    expect(archiveMath).toBeTruthy();
    const unitWorks = await list<{ workId: string }>(page, `/periods/${p}/academic-units/${unit}/works?limit=100`);
    expect(works.length).toBeGreaterThan(0);
    expect(unitWorks.length).toBeGreaterThan(0);
    const schedule = await list<{ scheduleId: string }>(page, "/schedule?from=2026-11-16&to=2026-11-22&limit=100");
    const materials = await list<{ materialId: string }>(page, "/materials?limit=20");
    let requests = await list<{ id: string }>(page, "/requests?limit=20");
    if (!requests.length) {
      await page.goto("/requests/new?type=DEMO_CERTIFICATE");
      await page.getByRole("button", { name: "Отправить заявку" }).click();
      await expect(page).toHaveURL(/\/requests\/[^/?]+$/);
      requests = await list<{ id: string }>(page, "/requests?limit=20");
    }
    let appeals = await list<{ id: string }>(page, "/appeals?limit=20");
    if (!appeals.length) {
      await page.goto("/appeals/new");
      await page.getByLabel("Тема").fill("Проверка страницы переписки");
      await page.getByLabel("Сообщение", { exact: true }).fill("Тестовое обращение для проверки оформления страницы переписки.");
      await page.getByRole("button", { name: "Отправить обращение" }).click();
      await expect(page).toHaveURL(/\/appeals\/(?!new(?:\?|$))[^/?]+$/);
      await expect(page.getByRole("heading", { name: "Сообщения" })).toBeVisible();
      appeals = await list<{ id: string }>(page, "/appeals?limit=20");
    }
    const announcements = await list<{ announcementId: string }>(page, "/announcements?limit=20");
    const events = await list<{ eventKey: string; starts: { on?: string; at?: string; timeZone?: string } }>(page, "/calendar?from=2026-11-01&to=2026-11-30&limit=100");
    for (const [name, collection] of Object.entries({ schedule, materials, requests, appeals, announcements, events })) expect(collection.length, name).toBeGreaterThan(0);
    const event = events[0];
    const eventDay = event.starts.on ?? localDay(event.starts.at!, event.starts.timeZone!);
    const offeringBase = `/study/${p}/${offering}`;
    const unitBase = `/study/${p}/units/${unit}`;
    const screens = [
      ["lesson-detail", `/schedule/${encode(schedule[0].scheduleId)}`],
      ["offering-overview", offeringBase],
      ["offering-sessions", `${offeringBase}?tab=sessions`],
      ["offering-works", `${offeringBase}?tab=works`],
      ["offering-results", `${offeringBase}?tab=results`],
      ["offering-timeline", `${offeringBase}?tab=timeline`],
      ["offering-materials", `${offeringBase}?tab=materials`],
      ["offering-work-list", `${offeringBase}/works`],
      ["offering-work-detail", `${offeringBase}/works/${encode(works[0].workId)}`],
      ["course-project", `/study/${p}/${encode(history!.offeringId)}/works/${encode(courseProject!.workId)}`],
      ["archive-results", `/study/${encode(archive!.periodId)}/${encode(archiveMath!.offeringId)}?tab=results`],
      ["unit-detail", unitBase],
      ["unit-work-list", `${unitBase}/works`],
      ["unit-work-detail", `${unitBase}/works/${encode(unitWorks[0].workId)}`],
      ["material-detail", `/materials/${encode(materials[0].materialId)}`],
      ["request-form", "/requests/new?type=DEMO_CERTIFICATE"],
      ["request-detail", `/requests/${encode(requests[0].id)}`],
      ["appeal-form", "/appeals/new"],
      ["appeal-detail", `/appeals/${encode(appeals[0].id)}`],
      ["announcement-detail", `/announcements/${encode(announcements[0].announcementId)}`],
      ["calendar-event-detail", `/calendar/events/${encode(event.eventKey)}?on=${eventDay}`],
    ] as const;
    for (const [name, route] of screens) {
      await page.goto(route);
      await expect(page.locator("main#main .page-hero h1, main#main .community-detail-panel h1").first(), route).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("Не удалось получить сведения", { exact: true }), route).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} at ${width}px`).toBe(true);
      const banner = page.locator("main#main .page-hero img");
      if (await banner.count()) await expect.poll(() => banner.first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), { message: `${name} image` }).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    }
    expect(errors, `JavaScript at ${width}px`).toEqual([]);
    await context.close();
  }
});
