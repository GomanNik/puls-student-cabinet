import { readFileSync } from "node:fs";
import { parse } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const specification = parse(readFileSync("документация/API/Контракт_студенческого_API.yaml", "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
export function contractAccepts(schema: string, value: unknown): boolean {
  const validate = ajv.compile({ $ref: `#/components/schemas/${schema}`, components: specification.components });
  return validate(value) as boolean;
}
