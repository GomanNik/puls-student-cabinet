import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { RemoteCache, mutationPrefixes } from "@/shared/api/remote-cache";
import { setClientSessionScope } from "@/shared/api/client";
import { RequestGeneration } from "@/shared/api/request-generation";

const schema = z.object({ data: z.object({ value: z.number() }) });
function response(value: number, scope = "student-a") {
  return new Response(JSON.stringify({ data: { value } }), { status: 200, headers: { "Content-Type": "application/json", "X-Puls-Session-Scope": scope } });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => setClientSessionScope("student-a"));
afterEach(() => { setClientSessionScope(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("кэш данных только в памяти подтверждённой сессии", () => {
  it("собирает занятия всех страниц недельного расписания без потерь", async () => {
    const scheduleSchema = z.object({ data: z.object({ items: z.array(z.object({ scheduleId: z.string() })), nextCursor: z.string().nullable(), isComplete: z.boolean() }), meta: z.object({ completeness: z.boolean() }) });
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const second = new URL(String(input), "https://localhost").searchParams.has("cursor");
      const start = second ? 20 : 0, end = second ? 25 : 20;
      return Promise.resolve(new Response(JSON.stringify({
        data: { items: Array.from({ length: end - start }, (_, index) => ({ scheduleId: `lesson-${start + index}` })), nextCursor: second ? null : "next", isComplete: true },
        meta: { completeness: true },
      }), { status: 200, headers: { "Content-Type": "application/json", "X-Puls-Session-Scope": "student-a" } }));
    });
    vi.stubGlobal("fetch", fetcher);
    const cache = new RemoteCache("student-a");
    const entry = cache.entry("/schedule?from=2026-11-16&to=2026-11-22&limit=20", scheduleSchema, true);
    await cache.ensure(entry);
    expect(entry.state).toMatchObject({ kind: "ready", value: { data: { items: Array.from({ length: 25 }, (_, index) => ({ scheduleId: `lesson-${index}` })), nextCursor: null } } });
    expect(fetcher).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it.each(["repeat", "empty"])("останавливает некорректную пагинацию (%s) без бесконечного запроса", async failure => {
    const pageSchema = z.object({ data: z.object({ items: z.array(z.object({ scheduleId: z.string() })), nextCursor: z.string().nullable(), isComplete: z.boolean() }), meta: z.object({ completeness: z.boolean() }) });
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const next = new URL(String(input), "https://localhost").searchParams.has("cursor");
      const items = next && failure === "empty" ? [] : [{ scheduleId: next ? "lesson-2" : "lesson-1" }];
      return Promise.resolve(new Response(JSON.stringify({ data: { items, nextCursor: "same-cursor", isComplete: true }, meta: { completeness: true } }), {
        status: 200, headers: { "Content-Type": "application/json", "X-Puls-Session-Scope": "student-a" },
      }));
    });
    vi.stubGlobal("fetch", fetcher);
    const cache = new RemoteCache("student-a"), entry = cache.entry("/schedule?limit=20", pageSchema, true);
    await cache.ensure(entry);
    expect(entry.state.kind).toBe("error");
    expect(fetcher).toHaveBeenCalledTimes(2);
    cache.dispose();
  });

  it("не склеивает материалы и работы одной дисциплины при добавлении страницы", () => {
    const cache = new RemoteCache("student-a");
    const entry = cache.entry("/materials", z.object({ data: z.object({ items: z.array(z.any()) }) }));
    cache.replace(entry, entry.version, { kind: "ready", value: { data: { items: [
      { materialId: "material-1", offeringId: "offering-1" },
      { materialId: "material-2", offeringId: "offering-1" },
      { workId: "work-1", offeringId: "offering-1" },
      { workId: "work-2", offeringId: "offering-1" },
      { materialId: "material-2", offeringId: "offering-1" },
    ] } } });
    expect(entry.state).toMatchObject({ kind: "ready", value: { data: { items: [
      { materialId: "material-1" }, { materialId: "material-2" }, { workId: "work-1" }, { workId: "work-2" },
    ] } } });
    cache.dispose();
  });

  it("объединяет параллельные одинаковые запросы и повторно показывает готовые данные", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetcher);
    const cache = new RemoteCache("student-a"), entry = cache.entry("/profile", schema);
    const first = cache.ensure(entry), second = cache.ensure(entry);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    pending.resolve(response(7));
    await Promise.all([first, second]);
    expect(entry.state).toMatchObject({ kind: "ready", value: { data: { value: 7 } } });
    await cache.ensure(entry);
    expect(fetcher).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it("при обновлении сохраняет старую версию до ответа и заменяет её свежей", async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn().mockResolvedValueOnce(response(1)).mockImplementationOnce(() => pending.promise);
    vi.stubGlobal("fetch", fetcher);
    const cache = new RemoteCache("student-a"), entry = cache.entry("/dashboard", schema);
    await cache.ensure(entry);
    const refresh = cache.reload(entry);
    expect(entry.state).toMatchObject({ kind: "ready", refreshing: true, value: { data: { value: 1 } } });
    await Promise.resolve();
    pending.resolve(response(2));
    await refresh;
    expect(entry.state).toMatchObject({ kind: "ready", value: { data: { value: 2 } } });
    cache.dispose();
  });

  it("ошибка фонового обновления оставляет видимые данные и сообщает об ошибке", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(1)).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "SOURCE_UNAVAILABLE" } }), { status: 503 })));
    const cache = new RemoteCache("student-a"), entry = cache.entry("/dashboard", schema);
    await cache.ensure(entry);
    await cache.reload(entry);
    expect(entry.state).toMatchObject({ kind: "ready", value: { data: { value: 1 } } });
    expect(entry.state.kind === "ready" && entry.state.refreshError).toBeTruthy();
    cache.dispose();
  });

  it("устаревший ответ после инвалидации не перезаписывает новую версию", async () => {
    const old = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(response(2)));
    const cache = new RemoteCache("student-a"), entry = cache.entry("/requests", schema);
    const first = cache.ensure(entry);
    await Promise.resolve();
    cache.invalidate(["/requests"], false);
    await cache.ensure(entry);
    old.resolve(response(1));
    await first;
    expect(entry.state).toMatchObject({ kind: "ready", value: { data: { value: 2 } } });
    cache.dispose();
  });

  it("после закрытия сессии не возвращает персональные записи из старого кэша", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(1)));
    const previous = new RemoteCache("student-a"), entry = previous.entry("/profile", schema);
    await previous.ensure(entry);
    previous.dispose();
    setClientSessionScope("student-b");
    const next = new RemoteCache("student-b"), nextEntry = next.entry("/profile", schema);
    expect(entry.state.kind).toBe("loading");
    expect(nextEntry.state.kind).toBe("loading");
    expect(nextEntry).not.toBe(entry);
    next.dispose();
  });

  it("инвалидация операции затрагивает связанные списки, уведомления и главную", () => {
    expect(mutationPrefixes("/requests")).toEqual(["/requests", "/notifications", "/dashboard"]);
    expect(mutationPrefixes("/appeals/id/messages")).toEqual(["/appeals", "/notifications", "/dashboard"]);
    expect(mutationPrefixes("/notifications/read")).toEqual(["/notifications", "/dashboard"]);
    expect(mutationPrefixes("/operations/resolve")).toEqual(["/requests", "/appeals", "/notifications", "/dashboard"]);
  });
});

describe("поколение запросов при быстрой навигации", () => {
  it("отменяет прошлый запрос и не принимает его ответ после смены экрана", () => {
    const generation = new RequestGeneration(), first = generation.next(), second = generation.next();
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    generation.invalidate();
    expect(second.signal.aborted).toBe(true);
    expect(second.isCurrent()).toBe(false);
  });
});
