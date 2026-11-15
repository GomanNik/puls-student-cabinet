import "server-only";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().url().refine(v => /^postgres(ql)?:/.test(v)),
  APP_ORIGIN: z.string().url().refine(v => {
    const u = new URL(v);
    return u.protocol === "https:" && u.origin === v && !u.username && !u.password;
  }),
  AUTH_RATE_LIMIT_HMAC_KEY: z.string().min(43),
  TRUSTED_PROXY_KEY: z.string().min(43),
  SESSION_COOKIE_NAME: z.literal("__Host-puls_session").default("__Host-puls_session"),
});
export type ServerConfig = z.infer<typeof configSchema>;
export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new Error("Некорректная серверная конфигурация. Проверьте обязательные переменные окружения.");
  return parsed.data;
}
