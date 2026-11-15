import { z } from "zod";

const codePoints = (min: number, max: number) => z.string().refine(v => [...v].length >= min && [...v].length <= max);
export const normalizeLogin = (login: string) => login.normalize("NFKC").trim().toLocaleLowerCase("ru-RU");
// Имена и пределы DTO — действующий Student OpenAPI /auth/login.
export const loginSchema = z.object({
  login: codePoints(1, 120).refine(v => !/[\p{Cc}\p{Cf}]/u.test(v))
    .transform(normalizeLogin).pipe(codePoints(1, 120)),
  password: codePoints(1, 256).refine(v => new TextEncoder().encode(v).byteLength <= 1024),
}).strict();
export const sessionSchema = z.object({
  displayName: z.string(), expiresAt: z.iso.datetime({ offset: true }), absoluteExpiresAt: z.iso.datetime({ offset: true }),
}).strict();
export const profileSchema = z.object({
  fullName: z.string().min(1).nullable(), faculty: z.string().min(1).nullable(), studyProgram: z.string().min(1).nullable(),
  course: z.number().int().min(1).nullable(), group: z.string().min(1).nullable(), academicLevel: z.string().optional(),
}).strict();
export const metaSchema = z.object({ requestId: z.string().min(1).max(240) }).strict();
export const sessionResponseSchema = z.object({ data: sessionSchema, meta: metaSchema }).strict();
export const profileResponseSchema = z.object({ data: profileSchema, meta: metaSchema }).strict();
export type Profile = z.infer<typeof profileSchema>;
export type Session = z.infer<typeof sessionSchema>;
