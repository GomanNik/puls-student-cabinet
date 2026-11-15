import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { demoStudents } from "../../prisma/seed-data";

function fixture(): { passwords: [string, string]; ids: [string, string] } {
  return JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8"));
}
async function login(page: Page, index: number) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[index].login);
  await page.getByLabel("Пароль", { exact: true }).fill(fixture().passwords[index]);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("heading", { name: demoStudents[index].fullName })).toBeVisible();
}
test("две реальные сессии, подмена идентификаторов, logout и повторный вход", async ({ browser }) => {
  const a = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: process.env.APP_ORIGIN });
  const b = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: process.env.APP_ORIGIN });
  const pa = await a.newPage(), pb = await b.newPage();
  await login(pa, 0); await login(pb, 1);
  const response = await pa.request.get(`/api/v1/profile?accountId=${fixture().ids[1]}&studentId=${fixture().ids[1]}`, { headers: { "x-account-id": fixture().ids[1] } });
  expect((await response.json()).data.fullName).toBe(demoStudents[0].fullName);
  const cookies = await a.cookies();
  const session = cookies.find(c => c.name === "__Host-puls_session")!;
  expect({ secure: session.secure, httpOnly: session.httpOnly, sameSite: session.sameSite, path: session.path }).toEqual({ secure: true, httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await pa.evaluate(() => document.cookie.includes("puls_session"))).toBe(false);
  await pa.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(pa.getByRole("heading", { name: "Вход в ПУЛЬС" })).toBeVisible();
  const replay = await pa.request.get("/api/v1/profile", { headers: { Cookie: `${session.name}=${session.value}` } });
  expect(replay.status()).toBe(401);
  await pa.goBack();
  await expect(pa.getByText(demoStudents[0].fullName)).toHaveCount(0);
  await login(pa, 1);
  await expect(pa.getByText(demoStudents[0].fullName)).toHaveCount(0);
  await expect(pb.getByRole("heading", { name: demoStudents[1].fullName })).toBeVisible();
  await a.close(); await b.close();
});
test("чистый браузер, ложная cookie, чужой Origin и закрытый внутренний health", async ({ page }) => {
  expect((await page.request.get("/api/v1/profile")).status()).toBe(401);
  expect((await page.request.get("/api/v1/profile", { headers: { Cookie: `__Host-puls_session=${"a".repeat(43)}` } })).status()).toBe(401);
  expect((await page.request.post("/api/v1/auth/login", { headers: { Origin: "https://attacker.invalid" }, data: { login: "demo-a", password: "wrong" } })).status()).toBe(403);
  expect((await page.request.get("/api/health/ready")).status()).toBe(404);
  expect((await page.request.get(`/api/v1/profile/${fixture().ids[1]}`)).status()).toBe(404);
  await page.goto("/profile"); await expect(page).toHaveURL(/\/login/);
});
test("неверный пароль, клавиатура и экраны 360 px", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByLabel("Логин", { exact: true })).toBeFocused();
  await page.getByLabel("Логин", { exact: true }).fill("demo-a");
  await page.keyboard.press("Tab"); await expect(page.getByLabel("Пароль", { exact: true })).toBeFocused();
  await page.keyboard.type("wrong");
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Показать пароль" })).toBeFocused();
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Неверный логин или пароль" })).toBeVisible();
  await page.getByLabel("Пароль", { exact: true }).clear();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("login-360.png"), fullPage: true });
  await login(page, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("profile-360.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath("profile-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});
test("другая вкладка очищается при выходе", async ({ page, context }) => {
  await login(page, 0);
  const second = await context.newPage(); await second.goto("/profile");
  await expect(second.getByRole("heading", { name: demoStudents[0].fullName })).toBeVisible();
  await page.bringToFront();
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(second).toHaveURL(/\/login/);
  await expect(second.getByText(demoStudents[0].fullName)).toHaveCount(0);
});
test("истёкшая сессия очищает экран и предлагает войти снова", async ({ page, context }) => {
  await login(page, 0);
  const cookie = (await context.cookies()).find(c => c.name === "__Host-puls_session")!;
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/puls_test") throw new Error("Разрешена только тестовая БД.");
  const pool = new Pool({ connectionString: url });
  try {
    const updated = await pool.query("UPDATE auth_session SET issued_at = now() - interval '2 days', last_activity_at = now() - interval '13 hours' WHERE token_digest=$1", [createHash("sha256").update(cookie.value).digest()]);
    expect(updated.rowCount).toBe(1);
  } finally { await pool.end(); }
  await page.bringToFront();
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page).toHaveURL(/\/login\?reason=expired/);
  await expect(page.getByRole("alert").filter({ hasText: "Сессия завершилась. Войдите снова." })).toBeVisible();
  await expect(page.getByText(demoStudents[0].fullName)).toHaveCount(0);
});
