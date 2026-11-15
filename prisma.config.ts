import { config } from "dotenv";
import { defineConfig } from "prisma/config";
config({ path: process.env.PULS_ENV_FILE ?? ".env.local", quiet: true });
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx --conditions=react-server prisma/seed.ts" },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL },
});
