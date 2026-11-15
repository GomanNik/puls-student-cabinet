import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'dotenv';

async function* files(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) yield* files(path);
    else if (item.isFile()) yield path;
  }
}
const secrets = [];
for (const path of ['.env.local', '.env.test.local']) {
  try {
    const env = parse(await readFile(path));
    for (const name of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'AUTH_RATE_LIMIT_HMAC_KEY', 'TRUSTED_PROXY_KEY', 'PULS_SEED_PASSWORD_A', 'PULS_SEED_PASSWORD_B']) if (env[name]) secrets.push(env[name]);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
let clientFiles = 0;
for await (const path of files('.next/static')) {
  if (!/\.(js|json|map|html)$/.test(path)) continue;
  const content = await readFile(path, 'utf8'); clientFiles++;
  if (secrets.some(secret => content.includes(secret))) throw new Error('Обнаружен серверный секрет в клиентском артефакте. Содержимое скрыто.');
}
let standaloneFiles = 0;
for await (const path of files('.next/standalone')) {
  standaloneFiles++;
  if (/(^|[\\/])(_reference|\.local)([\\/]|$)|(^|[\\/])\.env(?:\.|$)|OGE_Tutor.*\.zip$/i.test(path)) throw new Error('Запрещённый локальный материал попал в standalone-сборку.');
}
console.log(`Проверено клиентских файлов: ${clientFiles}; файлов standalone: ${standaloneFiles}. Серверные секреты окружения, reference и локальные данные не обнаружены.`);
