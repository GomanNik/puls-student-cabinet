import { createServer } from 'node:https';
import { request as upstreamRequest } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { config } from 'dotenv';
import selfsigned from 'selfsigned';

config({ path: process.env.PULS_ENV_FILE ?? '.env.local', quiet: true });
const origin = new URL(process.env.APP_ORIGIN);
if (origin.protocol !== 'https:' || origin.hostname !== 'localhost' || !process.env.TRUSTED_PROXY_KEY) throw new Error('Для локального TLS нужны https://localhost и серверная конфигурация.');
await mkdir('.local', { recursive: true });
let key, cert;
try { [key, cert] = await Promise.all([readFile('.local/localhost-key.pem'), readFile('.local/localhost-cert.pem')]); }
catch {
  const generated = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 30, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }] }] });
  key = generated.private; cert = generated.cert;
  await Promise.all([writeFile('.local/localhost-key.pem', key, { mode: 0o600 }), writeFile('.local/localhost-cert.pem', cert)]);
}
const port = Number(origin.port || 443);
const upstreamPort = Number(process.env.PULS_UPSTREAM_PORT || 3000);
function forwardedHeaders(req) {
  const headers = { ...req.headers };
  for (const name of Object.keys(headers)) if (name.startsWith('x-puls-') || name.startsWith('x-forwarded-') || name === 'forwarded' || name === 'x-health-token') delete headers[name];
  headers['x-puls-proxy-key'] = process.env.TRUSTED_PROXY_KEY;
  headers['x-puls-client-ip'] = req.socket.remoteAddress?.replace(/^::ffff:/, '') || '127.0.0.1';
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-host'] = origin.host;
  return headers;
}
const server = createServer({ key, cert }, (req, res) => {
  if (req.headers.host !== origin.host || req.url?.split('?')[0] === '/api/health/ready') { res.writeHead(404); res.end(); return; }
  const upstream = upstreamRequest({ hostname: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers: forwardedHeaders(req) }, result => {
    res.writeHead(result.statusCode || 502, result.headers); result.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Приложение пока недоступно.'); });
  req.pipe(upstream);
});

// Next.js dev передаёт по этому каналу также React debug stream. Если
// Upgrade теряется на TLS-прокси, HTML виден, но гидрация ждёт бесконечно.
const upgradedSockets = new Set();
server.on('upgrade', (req, socket, head) => {
  if (req.method !== 'GET' || req.headers.host !== origin.host || req.headers.origin !== origin.origin ||
      req.url?.split('?')[0] !== '/_next/webpack-hmr' || req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  upgradedSockets.add(socket);
  const upstream = upstreamRequest({ hostname: '127.0.0.1', port: upstreamPort, method: 'GET', path: req.url, headers: forwardedHeaders(req) });
  let peer;
  socket.on('error', () => { upstream.destroy(); peer?.destroy(); });
  socket.on('close', () => { upgradedSockets.delete(socket); upstream.destroy(); peer?.destroy(); });
  upstream.on('error', () => socket.destroy());
  upstream.setTimeout(10_000, () => upstream.destroy());
  upstream.on('response', response => {
    response.resume();
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
    peer = upstreamSocket;
    upstream.setTimeout(0);
    peer.setTimeout(0);
    peer.on('error', () => socket.destroy());
    peer.on('close', () => socket.destroy());
    if (socket.destroyed) { peer.destroy(); return; }
    const headers = [];
    for (let i = 0; i < response.rawHeaders.length; i += 2) headers.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join('\r\n')}\r\n\r\n`);
    if (head.length) peer.write(head);
    if (upstreamHead.length) socket.write(upstreamHead);
    socket.pipe(peer).pipe(socket);
  });
  upstream.end();
});
server.listen(port, 'localhost', () => console.log(`Локальный HTTPS: ${origin.origin}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  for (const socket of upgradedSockets) socket.destroy();
  server.close(() => process.exit(0));
});
