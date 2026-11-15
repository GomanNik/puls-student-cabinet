import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

if (!process.env.npm_execpath) throw new Error('Запустите через pnpm build.');
const licenses = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'licenses', 'list', '--prod', '--json'], { encoding: 'utf8', windowsHide: true }));
const sections = ['ПУЛЬС — уведомления о сторонних зависимостях\nСформировано из установленных production-зависимостей; состав может зависеть от ОС.\nТексты лицензий сохранены на языке правообладателя.'];
for (const packages of Object.values(licenses)) {
  for (const item of packages) {
    const texts = [];
    for (const directory of item.paths) {
      for (const file of await readdir(directory, { withFileTypes: true })) {
        if (file.isFile() && /^(licen[cs]e|notice|copying)(\.|$)/i.test(file.name)) texts.push(await readFile(join(directory, file.name), 'utf8'));
      }
    }
    sections.push([`${item.name} — ${item.versions.join(', ')} — ${item.license}`, item.author ?? '', item.homepage ?? '', ...new Set(texts)].join('\n'));
  }
}
sections.push('Noto Sans Regular — SIL Open Font License 1.1\n' + await readFile('src/assets/fonts/OFL.txt', 'utf8'));
await writeFile('.next/standalone/THIRD_PARTY_NOTICES.txt', sections.join('\n\n' + '='.repeat(72) + '\n\n'));
console.log('Уведомления о лицензиях зависимостей включены в standalone-сборку.');
