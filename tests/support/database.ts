import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedStudents } from "../../prisma/seed-service";

export function testDatabase() {
  config({ path: ".env.test.local", override: true, quiet: true });
  process.env.PULS_AI_PROVIDER = "DEMO_MOCK";
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url || new URL(url).pathname !== "/puls_test") throw new Error("Проверки разрешены только в отдельной БД puls_test.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: "-c timezone=UTC", max: 4 }) });
}
export async function prepareTestDatabase(db: PrismaClient) {
  const [identity] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (identity.name !== "puls_test") throw new Error("Отказ очистки: это не тестовая БД.");
  await db.$executeRaw`TRUNCATE auth_session, auth_rate_bucket, student_profile, student_external_identity, account_credential, student_account, academic_group_ref, study_program_ref, faculty_ref CASCADE`;
  const passwords = [randomBytes(24).toString("base64url"), randomBytes(24).toString("base64url")] as const;
  const ids = await seedStudents(db, passwords);
  return { passwords, ids };
}
