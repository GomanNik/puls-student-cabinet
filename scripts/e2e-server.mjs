import { spawn } from 'node:child_process';
import { config } from 'dotenv';
config({ path: '.env.test.local', override: true, quiet: true });
const env = { ...process.env, PULS_ENV_FILE: '.env.test.local', PULS_UPSTREAM_PORT: '3001', PORT: '3001' };
const children = [
  spawn(process.execPath, ['scripts/start.mjs'], { env, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['scripts/local-https.mjs'], { env, stdio: 'inherit', windowsHide: true }),
];
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const child of children) child.kill(); });
for (const child of children) child.on('exit', code => { for (const other of children) if (other !== child) other.kill(); process.exitCode = code ?? 0; });
