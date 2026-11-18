import { config } from "dotenv";
import { defineConfig } from "prisma/config";
config({ path: process.env.PULS_ENV_FILE ?? ".env.local", quiet: true });
const migrationUrl = process.env.MIGRATION_DATABASE_URL?.trim();
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx --conditions=react-server prisma/seed.ts" },
  // Генерация не требует БД. Для migrate нужен явный URL владельца,
  // без неявного перехода на runtime-роль или пустую строку из шаблона env.
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
