import { describe, expect, it } from "vitest";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { GigaChatProvider } from "@/server/integrations/assistant-provider";

// Оплачиваемые сетевые запросы выполняются только по явному решению оператора.
describe.skipIf(process.env.GIGACHAT_LIVE_TEST !== "1")("реальный GigaChat (opt-in)", () => {
  it("проходит OAuth, генерирует ответ и продолжает диалог", async () => {
    config({ path: ".env.local", quiet: true });
    if (!process.env.GIGACHAT_AUTHORIZATION_KEY) throw new Error("Добавьте GIGACHAT_AUTHORIZATION_KEY в серверное окружение или .env.local");
    const nativeFetch = globalThis.fetch;
    const observed: Array<{ endpoint: string; status: number; durationMs: number; model?: string; requestId?: string }> = [];
    globalThis.fetch = async (input, init) => {
      const endpoint = new URL(input instanceof Request ? input.url : String(input)).pathname;
      const started = performance.now();
      const response = await nativeFetch(input, init);
      const entry: typeof observed[number] = { endpoint, status: response.status, durationMs: Math.round(performance.now() - started) };
      const requestId = response.headers.get("x-request-id");
      if (requestId) entry.requestId = requestId.slice(0, 100);
      if (endpoint.endsWith("/chat/completions") && response.ok) {
        try {
          const payload = await response.clone().json() as { model?: unknown };
          if (typeof payload.model === "string") entry.model = payload.model.slice(0, 100);
        } catch { /* Метаданные не влияют на проверку ответа адаптера. */ }
      }
      observed.push(entry);
      return response;
    };
    try {
      const provider = new GigaChatProvider();
      const arithmetic = await provider.answer("Ответь одним предложением: сколько будет 2 + 2?", [], []);
      expect(arithmetic.text).toMatch(/\b4\b|четыре/iu);
      const first = await provider.answer("Назови число 17", [], []);
      expect(first.text).toMatch(/\b17\b|семнадцать/iu);
      const second = await provider.answer("Прибавь к нему 5", [], [
        { role: "user", content: "Назови число 17" },
        { role: "assistant", content: first.text },
      ]);
      expect(second.text).toMatch(/\b22\b|двадцать два/iu);
      const previousModel = process.env.GIGACHAT_MODEL;
      process.env.GIGACHAT_MODEL = "PULS_INVALID_MODEL_TEST";
      try { await expect(provider.answer("Проверка имени модели", [], [])).rejects.toMatchObject({ kind: "MODEL" }); }
      finally { if (previousModel === undefined) delete process.env.GIGACHAT_MODEL; else process.env.GIGACHAT_MODEL = previousModel; }
      const key = process.env.GIGACHAT_AUTHORIZATION_KEY!;
      const changeAt = Math.floor(key.length / 2);
      const invalidKey = key.slice(0, changeAt) + (key[changeAt] === "A" ? "B" : "A") + key.slice(changeAt + 1);
      const invalid = await nativeFetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Basic ${invalidKey}`, RqUID: randomUUID(), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ scope: process.env.GIGACHAT_SCOPE ?? "GIGACHAT_API_PERS" }),
      });
      expect(invalid.status).toBe(401);
      expect(observed.filter(entry => entry.endpoint.endsWith("/oauth") && entry.status === 200)).toHaveLength(1);
      expect(observed.filter(entry => entry.endpoint.endsWith("/chat/completions") && entry.status === 200)).toHaveLength(3);
      expect(observed.filter(entry => entry.endpoint.endsWith("/chat/completions") && entry.status === 404)).toHaveLength(1);
      writeFileSync(".local/gigachat-live-metadata.json", JSON.stringify({ requests: observed, invalidCredentialStatus: invalid.status }, null, 2));
    } finally { globalThis.fetch = nativeFetch; }
  }, 90_000);
});
