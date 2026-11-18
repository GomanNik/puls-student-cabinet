import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedOperations } from "./seed-operations";
import { seedStudents } from "./seed-service";

config({ path: process.env.PULS_ENV_FILE ?? ".env.local", quiet: true });
function hiddenPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Передайте seed-пароли через временное окружение или используйте интерактивный терминал.");
  process.stdout.write(label);
  process.stdin.setRawMode(true); process.stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    function finish() { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", receive); process.stdout.write("\n"); }
    function receive(data: Buffer) {
      for (const char of data.toString("utf8")) {
        if (char === "\u0003") { finish(); reject(new Error("Ввод отменён.")); return; }
        if (char === "\r" || char === "\n") { finish(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = [...value].slice(0, -1).join("");
        else if (char >= " ") value += char;
      }
    }
    process.stdin.on("data", receive);
  });
}
const migrationUrl = process.env.MIGRATION_DATABASE_URL?.trim();
if (!migrationUrl) throw new Error("Для seed требуется явный MIGRATION_DATABASE_URL владельца БД.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: migrationUrl, options: "-c timezone=UTC" }) });
try {
  const a = process.env.PULS_SEED_PASSWORD_A ?? await hiddenPassword("Пароль вымышленного demo-a (ввод скрыт): ");
  const b = process.env.PULS_SEED_PASSWORD_B ?? await hiddenPassword("Пароль вымышленного demo-b (ввод скрыт): ");
  const accounts=await seedStudents(db, [a, b]);
  await seedOperations(db,accounts);
  console.log("Демонстрационные аккаунты подготовлены. Существующие пароли и данные не изменены.");
} catch { console.error("Не удалось выполнить seed. Проверьте подключение и два разных пароля от 16 символов."); process.exitCode = 1; }
finally { delete process.env.PULS_SEED_PASSWORD_A; delete process.env.PULS_SEED_PASSWORD_B; await db.$disconnect(); }
