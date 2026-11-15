import { writeFile, mkdir } from "node:fs/promises";
import { prepareTestDatabase, testDatabase } from "../tests/support/database";
const db = testDatabase();
try {
  const fixture = await prepareTestDatabase(db);
  await mkdir(".local", { recursive: true });
  await writeFile(".local/e2e-fixture.json", JSON.stringify(fixture), { mode: 0o600 });
} finally { await db.$disconnect(); }
