import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { demoStudents } from "../../prisma/seed-data";

test.skip(process.env.GIGACHAT_LIVE_TEST !== "1", "Реальный провайдер проверяется только по явному включению");

test("настоящий GigaChat продолжает диалог после обновления и изолирует аккаунты", async ({ page }) => {
  test.setTimeout(120_000);
  if (process.env.PULS_AI_PROVIDER !== "GIGACHAT" || !process.env.GIGACHAT_AUTHORIZATION_KEY)
    throw new Error("Для live E2E нужны PULS_AI_PROVIDER=GIGACHAT и серверный ключ GIGACHAT_AUTHORIZATION_KEY");
  const { passwords } = JSON.parse(readFileSync(".local/e2e-fixture.json", "utf8")) as { passwords: [string, string] };
  async function enter(index: 0 | 1) {
    await page.goto("/login");
    await page.getByLabel("Логин", { exact: true }).fill(demoStudents[index].login);
    await page.getByLabel("Пароль", { exact: true }).fill(passwords[index]);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
    await page.goto("/assistant");
  }
  async function ask(question: string) {
    const replies = page.getByRole("article", { name: "Ответ помощника" });
    const previousCount = await replies.count();
    await page.getByRole("textbox", { name: "Ваш вопрос" }).fill(question);
    const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/v1/assistant/ask") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Отправить сообщение" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect((await response.json()).data.providerMode).toBe("GIGACHAT");
    if (question === "Прибавь к нему 5") {
      const body = response.request().postDataJSON() as { history?: Array<{ role: string; content: string }> };
      expect(body.history?.map(turn => turn.role)).toEqual(["user", "assistant"]);
      expect(body.history?.[0].content).toContain("17");
    }
    await expect(replies).toHaveCount(previousCount + 1);
    const answer = replies.last();
    await expect(answer.getByText("GigaChat", { exact: true })).toBeVisible({ timeout: 45_000 });
    return answer.locator(".assistant-answer-text");
  }

  await enter(0);
  await expect(await ask("Назови число 17")).toContainText(/17|семнадцать/iu);
  await expect(await ask("Прибавь к нему 5")).toContainText(/22|двадцать два/iu);
  await expect(await ask("Покажи мои уведомления")).not.toBeEmpty();
  await page.reload();
  await expect(page.getByRole("article", { name: "Ваш вопрос" })).toHaveCount(3);
  await page.goto("/study");
  await page.goto("/assistant");
  await expect(page.getByRole("article", { name: "Ответ помощника" })).toHaveCount(3);
  await page.getByRole("complementary").getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await enter(1);
  await expect(page.getByLabel("Переписка пока пуста")).toBeVisible();
  await expect(await ask("Ответь одним предложением: сколько будет 2 + 2?")).toContainText(/\b4\b|четыре/iu);
  await expect(await ask("Покажи мои уведомления")).not.toBeEmpty();
});
