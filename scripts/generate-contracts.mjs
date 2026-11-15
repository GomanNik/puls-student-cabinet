// Генерация локальных Zod DTO из утверждённых OpenAPI. Не выполняет запросы и тесты.
import fs from "node:fs";
import YAML from "yaml";

function generate(input, output, serverOnly) {
  const schemas = YAML.parse(fs.readFileSync(input, "utf8")).components.schemas;
  const emitted = new Set(), visiting = new Set(), lines = [];
  const literal = value => JSON.stringify(value);
  const symbol = name => `${name}Schema`;
  function emit(name) {
    if (emitted.has(name)) return;
    if (visiting.has(name)) throw new Error(`Циклический DTO: ${name}`);
    visiting.add(name);
    const expression = compile(schemas[name]);
    lines.push(`export const ${symbol(name)} = ${expression};\nexport type ${name} = z.infer<typeof ${symbol(name)}>;`);
    visiting.delete(name); emitted.add(name);
  }
  function compile(s) {
    if (s === false) return "z.never()";
    if (s === true || !s) return "z.unknown()";
    if (s.$ref) {
      const name = s.$ref.split("/").at(-1); emit(name); return symbol(name);
    }
    let result;
    if ("const" in s) result = `z.literal(${literal(s.const)})`;
    else if (s.enum) result = s.enum.length === 1 ? `z.literal(${literal(s.enum[0])})` : `z.union([${s.enum.map(v => `z.literal(${literal(v)})`).join(",")}])`;
    else if ((s.oneOf || s.anyOf) && !s.type && !s.properties) {
      const choices = s.oneOf ?? s.anyOf;
      result = `z.union([${choices.map(compile).join(",")}])`;
      if (s.oneOf) result += `.refine(value => [${choices.map(compile).join(",")}].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO")`;
    } else if (Array.isArray(s.type)) result = `z.union([${s.type.map(type => compile({ ...s, type })).join(",")}])`;
    else if (s.type === "object" || s.properties || s.required) {
      const required = new Set(s.required ?? []);
      result = `${s.additionalProperties === false ? "z.strictObject" : "z.looseObject"}({${Object.entries(s.properties ?? {}).map(([name, prop]) => `${literal(name)}:${compile(prop)}${required.has(name) ? "" : ".optional()"}`).join(",")}})`;
      if (typeof s.additionalProperties === "object") result += `.catchall(${compile(s.additionalProperties)})`;
      const extraRequired = [...required].filter(name => !Object.hasOwn(s.properties ?? {}, name));
      if (extraRequired.length) result += `.refine(value => ${literal(extraRequired)}.every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле")`;
    } else if (s.type === "array" || s.items || s.minItems != null || s.maxItems != null) {
      result = `z.array(${compile(s.items)})`;
      if (s.minItems != null) result += `.min(${s.minItems})`;
      if (s.maxItems != null) result += `.max(${s.maxItems})`;
      if (s.uniqueItems) result += `.refine(items => new Set(items.map(item => JSON.stringify(item))).size === items.length)`;
    } else if (s.type === "string") {
      result = "z.string()";
      if (s.minLength != null) result += `.min(${s.minLength})`;
      if (s.maxLength != null) result += `.max(${s.maxLength})`;
      if (s.pattern) result += `.regex(new RegExp(${literal(s.pattern)}))`;
      if (s.format === "date") result += ".date()";
      if (s.format === "date-time") result += ".datetime({offset:true})";
      if (s.format === "uuid") result += ".uuid()";
      if (s.format === "uri") result += ".url()";
    } else if (s.type === "integer" || s.type === "number") {
      result = s.type === "integer" ? "z.number().int()" : "z.number()";
      if (s.minimum != null) result += `.min(${s.minimum})`;
      if (s.maximum != null) result += `.max(${s.maximum})`;
    } else if (s.type === "boolean") result = "z.boolean()";
    else if (s.type === "null") result = "z.null()";
    else result = "z.unknown()";
    if ((s.type || s.properties) && (s.oneOf || s.anyOf)) {
      const variants = s.oneOf ?? s.anyOf;
      result += `.refine(value => [${variants.map(compile).join(",")}].filter(schema => schema.safeParse(value).success).length ${s.oneOf ? "=== 1" : "> 0"}, "Нарушен вариант DTO")`;
    }
    // JSON Schema 2020-12: contains выбирает элементы массива, min/maxContains
    // ограничивают число совпадений. Это важно для каталога полей двух форм.
    // Ограничение может быть вложено в allOf без явного type: array.
    if (s.contains !== undefined) {
      const matchSchema = compile(s.contains);
      const minMatches = s.minContains ?? 1;
      const maxMatches = s.maxContains;
      result += `.refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (${matchSchema}).safeParse(item).success).length; return count >= ${minMatches}${maxMatches == null ? "" : ` && count <= ${maxMatches}`}; })(), "Нарушено количество элементов contains")`;
    }
    for (const constraint of s.allOf ?? []) result += `.refine(value => ${compile(constraint)}.safeParse(value).success, "Нарушено ограничение DTO")`;
    if (s.if && s.then) result += `.refine(value => !${compile(s.if)}.safeParse(value).success || ${compile(s.then)}.safeParse(value).success, "Нарушено условие DTO")`;
    if (s.not) result += `.refine(value => !${compile(s.not)}.safeParse(value).success)`;
    return result;
  }
  for (const name of Object.keys(schemas)) emit(name);
  fs.mkdirSync(output.slice(0, output.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(output, `// Сгенерировано scripts/generate-contracts.mjs. Источник: ${input}\n${serverOnly ? 'import "server-only";\n' : ""}import { z } from "zod";\n\n${lines.join("\n\n")}\n`);
  process.stdout.write(`Созданы DTO: ${output}\n`);
}
generate("документация/API/Контракт_студенческого_API.yaml", "src/shared/contracts/student-api.ts", false);
generate("документация/API/Контракты_внешних_систем.yaml", "src/server/integrations/contracts.ts", true);
