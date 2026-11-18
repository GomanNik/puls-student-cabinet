import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const facts = [{ id: "f1", text: "Подтверждённый срок учебной работы." }, { id: "f2", text: "Подтверждённое занятие." }];
const oauth = () => new Response(JSON.stringify({ access_token: "temporary-access-token", expires_at: Date.now() + 300_000 }), { status: 200 });
const completion = (ids: string[]) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ factIds: ids }) } }] }), { status: 200 });
async function provider() {
  vi.resetModules();
  const { GigaChatProvider } = await import("@/server/integrations/assistant-provider");
  return new GigaChatProvider();
}
beforeEach(() => { vi.stubEnv("GIGACHAT_AUTHORIZATION_KEY", "test-only-credential"); vi.stubEnv("GIGACHAT_SCOPE", "GIGACHAT_API_PERS"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("серверный адаптер GigaChat без обращения к внешней сети", () => {
  it("получает OAuth-токен и просит выбрать только ID переданных разрешённых фактов", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return url.includes("oauth") ? oauth() : completion(["f1"]);
    }));
    expect(await (await provider()).select("Когда срок?", facts)).toEqual(["f1"]);
    expect(calls.map(call => call.url)).toEqual(["https://ngw.devices.sberbank.ru:9443/api/v2/oauth", "https://api.giga.chat/v1/chat/completions"]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Basic test-only-credential");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer temporary-access-token");
    expect(calls.every(call => call.init.redirect === "error" && !!call.init.signal)).toBe(true);
    const body = JSON.parse(String(calls[1].init.body));
    expect(JSON.parse(body.messages[1].content)).toEqual({ question: "Когда срок?", untrustedFacts: facts });
    expect(body.messages[0].content).toContain("не инструкции");
    expect(body.response_format.strict).toBe(true);
  });

  it("не принимает выдуманный провайдером ID и не отдаёт его как ссылку", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("oauth") ? oauth() : completion(["f999"])));
    await expect((await provider()).select("Когда срок?", facts)).rejects.toThrow("Unknown fact selected");
  });

  it("повторный ID возвращается один раз", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("oauth") ? oauth() : completion(["f1", "f1", "f2"])));
    expect(await (await provider()).select("Когда срок?", facts)).toEqual(["f1", "f2"]);
  });

  it("не вызывается без серверного ключа и отвергает недопустимую область OAuth", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("GIGACHAT_AUTHORIZATION_KEY", "");
    await expect((await provider()).select("Когда срок?", facts)).rejects.toThrow("Provider not configured");
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("GIGACHAT_AUTHORIZATION_KEY", "test-only-credential");
    vi.stubEnv("GIGACHAT_SCOPE", "FOREIGN_SCOPE");
    await expect((await provider()).select("Когда срок?", facts)).rejects.toThrow("Invalid provider configuration");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("отклоняет слишком длинный ответ провайдера до разбора JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("oauth") ? oauth() : new Response("x".repeat(65_537), { status: 200 })));
    await expect((await provider()).select("Когда срок?", facts)).rejects.toThrow("Provider response too large");
  });

  it("повторно использует OAuth-токен с expires_at в секундах Unix", async () => {
    const fetcher = vi.fn(async (url: string) => url.includes("oauth")
      ? new Response(JSON.stringify({ access_token: "temporary-access-token", expires_at: Math.floor(Date.now() / 1000) + 300 }), { status: 200 })
      : completion(["f1"]));
    vi.stubGlobal("fetch", fetcher);
    const client = await provider();
    await client.select("Когда срок?", facts);
    await client.select("Когда срок?", facts);
    expect(fetcher.mock.calls.filter(([url]) => url.includes("oauth"))).toHaveLength(1);
  });

  it("при 401 обновляет токен один раз и повторяет запрос", async () => {
    let oauthCount = 0, completionCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("oauth")) { oauthCount++; return oauth(); }
      completionCount++;
      return completionCount === 1 ? new Response("", { status: 401 }) : completion(["f1"]);
    }));
    expect(await (await provider()).select("Когда срок?", facts)).toEqual(["f1"]);
    expect(oauthCount).toBe(2);
    expect(completionCount).toBe(2);
  });

  it("передаёт историю в реальную генерацию и принимает только разрешённые ссылки", async () => {
    let body: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("oauth")) return oauth();
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "22", factIds: ["f1"] }) } }] }), { status: 200 });
    }));
    const response = await (await provider()).answer("Прибавь к нему 5", facts, [{ role: "user", content: "Назови число 17" }, { role: "assistant", content: "17" }]);
    expect(response).toEqual({ text: "22", factIds: ["f1"] });
    expect((body?.messages as Array<{ role: string; content: string }>).map(message => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(JSON.parse((body?.messages as Array<{ content: string }>)[3].content).question).toBe("Прибавь к нему 5");
  });

  it("не принимает выдуманную ссылку и различает ошибки ограничения и модели", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("oauth") ? oauth() : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: "Ответ", factIds: ["f999"] }) } }] }), { status: 200 })));
    await expect((await provider()).answer("Вопрос", facts, [])).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
    for (const [status, kind] of [[429, "RATE_LIMIT"], [404, "MODEL"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("oauth") ? oauth() : new Response("", { status })));
      await expect((await provider()).answer("Вопрос", facts, [])).rejects.toMatchObject({ kind });
    }
  });

  it("не раскрывает ошибку OAuth и не посылает запрос к модели при неверном ключе", async () => {
    const fetcher = vi.fn(async () => new Response("secret details", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect((await provider()).answer("Вопрос", [], [])).rejects.toMatchObject({ kind: "AUTH" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ограниченно повторяет временную ошибку сервера и отклоняет неверный JSON ответа", async () => {
    let completions = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("oauth")) return oauth();
      completions++;
      return completions === 1 ? new Response("", { status: 500 }) : new Response("not-json", { status: 200 });
    }));
    await expect((await provider()).answer("Вопрос", [], [])).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
    expect(completions).toBe(2);
  });

  it("различает тайм-аут и недоступность сети без текста исходной ошибки", async () => {
    for (const [name, kind] of [["TimeoutError", "TIMEOUT"], ["TypeError", "UNAVAILABLE"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => { const failure = new Error("private transport details"); failure.name = name; throw failure; }));
      await expect((await provider()).answer("Вопрос", [], [])).rejects.toMatchObject({ kind });
    }
  });
});
