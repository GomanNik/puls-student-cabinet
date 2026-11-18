import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { demoStudents } from "../../prisma/seed-data";

function passwords(): [string, string] {
  return (JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] }).passwords;
}

async function enter(page: Page, account: number) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(demoStudents[account].login);
  await page.getByLabel("Пароль", { exact: true }).fill(passwords()[account]);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}

for (const account of [0, 1]) {
  test(`профиль студента ${account + 1} показывает только его подтверждённые сведения и не редактируется`, async ({ page }) => {
    await enter(page, account);
    await page.goto("/profile");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: demoStudents[account].fullName })).toBeVisible();
    await expect(main.getByText(demoStudents[account].faculty, { exact: true })).toBeVisible();
    await expect(main.getByText(demoStudents[account].group, { exact: true })).toBeVisible();
    await expect(main.getByText(demoStudents[1 - account].fullName, { exact: true })).toHaveCount(0);
    await expect(main.locator("input, textarea, select")).toHaveCount(0);
    await main.getByRole("link", { name: /Перейти в раздел «Учёба»/ }).click();
    await expect(page).toHaveURL(/\/study(?:\?|$)/);
  });
}

test("ошибка загрузки профиля видна и повтор запроса восстанавливает данные", async ({ page }) => {
  await enter(page, 0);
  let attempts = 0;
  await page.route("**/api/v1/profile", async route => {
    attempts++;
    if (attempts === 1) await route.abort("failed");
    else await route.continue();
  });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Не удалось получить сведения" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Сейчас не удаётся выполнить действие" })).toBeVisible();
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("heading", { name: demoStudents[0].fullName })).toBeVisible();
  expect(attempts).toBe(2);
});
