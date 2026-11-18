import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type Operation = { operationId?: string; responses?: Record<string, unknown> };
type Document = { openapi: string; servers: Array<{ url: string }>; paths: Record<string, Partial<Record<"get" | "post" | "head" | "put" | "patch" | "delete", Operation>>> };
const contract = parse(readFileSync("документация/API/Контракт_студенческого_API.yaml", "utf8")) as Document;
const methods = ["get", "post", "head", "put", "patch", "delete"] as const;
function routes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? routes(file) : entry.name === "route.ts" ? [file] : [];
  });
}
const root = path.join("src", "app", "api", "v1");
const documented = Object.entries(contract.paths).flatMap(([route, operations]) => methods.filter(method => operations[method]).map(method => ({ key: `${method.toUpperCase()} ${route}`, operation: operations[method]! })));
const implemented = routes(root).filter(file => !file.includes("[...path]")).flatMap(file => {
  const route = `/${path.relative(root, path.dirname(file)).replaceAll("\\", "/").replace(/\[([^\]]+)\]/g, "{$1}")}`;
  const source = readFileSync(file, "utf8");
  return methods.filter(method => new RegExp(`export (?:const |(?:async )?function )${method.toUpperCase()}\\b`).test(source)).map(method => `${method.toUpperCase()} ${route}`);
});

describe("49 операций OpenAPI 3.1 и маршруты приложения", () => {
  it("каждой документированной операции соответствует ровно один Route Handler", () => {
    expect(contract.openapi).toBe("3.1.0");
    expect(contract.servers.map(server => server.url)).toContain("/api/v1");
    expect(documented).toHaveLength(49);
    expect(new Set(documented.map(item => item.key)).size).toBe(documented.length);
    expect(implemented.sort()).toEqual(documented.map(item => item.key).sort());
  });

  it("operationId уникальны; у каждой операции указан успешный ответ", () => {
    const ids = documented.map(item => item.operation.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { key, operation } of documented) {
      expect(Object.keys(operation.responses ?? {}).some(code => /^2\d\d$/.test(code)), key).toBe(true);
    }
  });

  it("официальные академические сведения доступны только для чтения", () => {
    const official = documented.filter(({ key }) => /^\w+ \/(?:periods|schedule|materials|academic\/search)/.test(key));
    expect(official.length).toBeGreaterThan(0);
    expect(official.every(({ key }) => /^(?:GET|HEAD) /.test(key))).toBe(true);
  });
});
