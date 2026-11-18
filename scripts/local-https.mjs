import { createServer } from 'node:https';
import { request as upstreamRequest } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
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
// Недоверенный сертификат браузер отклонит сам. Здесь заранее отсеиваем
// ошибочный, истёкший или не относящийся к localhost комплект файлов.
const certificate = new X509Certificate(cert);
if (!certificate.checkHost('localhost') || Date.now() < Date.parse(certificate.validFrom) || Date.now() > Date.parse(certificate.validTo) ||
    !certificate.publicKey.export({ type: 'spki', format: 'der' }).equals(createPublicKey(createPrivateKey(key)).export({ type: 'spki', format: 'der' })))
  throw new Error('Локальный сертификат HTTPS недействителен для localhost. Проверьте .local/localhost-cert.pem и .local/localhost-key.pem.');
const port = Number(origin.port || 443);
const upstreamPort = Number(process.env.PULS_UPSTREAM_PORT || 3000);
const expectedNetworkErrors = new Set(['ECONNRESET', 'EPIPE', 'ECONNABORTED', 'ECONNREFUSED', 'ETIMEDOUT', 'ERR_STREAM_PREMATURE_CLOSE']);
let trustAlertCount = 0, lastTrustAlertAt = 0;
function reportNetworkError(context, error) {
  if (expectedNetworkErrors.has(error?.code)) return;
  if (error?.code === 'ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN') {
    trustAlertCount++;
    if (Date.now() - lastTrustAlertAt >= 60_000) {
      console.error(`ПУЛЬС HTTPS: TLS-клиент отклонил локальный сертификат (ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN; событий: ${trustAlertCount}). Проверьте доверие сертификату в Windows.`);
      trustAlertCount = 0; lastTrustAlertAt = Date.now();
    }
    return;
  }
  // Не печатаем запрос, заголовки или сообщение ошибки с возможными секретами.
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'UNKNOWN';
  console.error(`ПУЛЬС HTTPS: ${context}; код ${code}.`);
}
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
  let upstream, response;
  let stopped = false;
  function cancelUpstream() {
    if (upstream) { req.unpipe(upstream); upstream.destroy(); }
    response?.unpipe(res);
    response?.destroy();
  }
  function disconnect() {
    stopped = true;
    cancelUpstream();
    res.destroy();
  }
  function unavailable(error) {
    if (error) reportNetworkError('ответ Next.js', error);
    if (stopped) return;
    stopped = true;
    cancelUpstream();
    if (res.destroyed || res.writableEnded) return;
    // После начала ответа нельзя дописывать сообщение об ошибке в HTML/JS.
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Приложение пока недоступно.');
  }
  req.on('aborted', disconnect);
  req.on('error', error => { reportNetworkError('запрос браузера', error); disconnect(); });
  res.on('error', error => { reportNetworkError('ответ браузеру', error); disconnect(); });
  res.on('close', () => { if (!res.writableFinished) disconnect(); });
  if (req.headers.host !== origin.host || req.url?.split('?')[0] === '/api/health/ready') { res.writeHead(404); res.end(); return; }
  upstream = upstreamRequest({ hostname: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers: forwardedHeaders(req) }, result => {
    response = result;
    result.on('error', unavailable);
    result.on('aborted', () => unavailable());
    result.on('close', () => { if (!result.complete) unavailable(); });
    if (stopped || res.destroyed || res.writableEnded) { cancelUpstream(); return; }
    res.writeHead(result.statusCode || 502, result.headers); result.pipe(res);
  });
  upstream.on('error', unavailable);
  req.pipe(upstream);
});

// После Upgrade HTTP-парсер больше не владеет TLSSocket. Обработчик
// соединения остаётся и для отклонённого Upgrade, и для обычного HTTPS.
server.on('secureConnection', socket => {
  socket.on('error', error => { reportNetworkError('TLS-соединение', error); socket.destroy(); });
});
server.on('tlsClientError', (error, socket) => {
  reportNetworkError('TLS-handshake', error);
  socket.destroy();
});
server.on('clientError', (error, socket) => {
  reportNetworkError('HTTP-соединение', error);
  socket.destroy();
});

// Next.js dev передаёт по этому каналу также React debug stream. Если
// Upgrade теряется на TLS-прокси, HTML виден, но гидрация ждёт бесконечно.
// Точные пути Turbopack и Webpack. Query (включая id) передаётся без изменений.
const hmrPaths = new Set(['/_next/hmr', '/_next/webpack-hmr']);
const upgradedSockets = new Set();
server.on('upgrade', (req, socket, head) => {
  let upstream, peer;
  let closed = false;
  function closeTunnel() {
    closed = true;
    upgradedSockets.delete(socket);
    socket.unpipe(peer);
    peer?.unpipe(socket);
    upstream?.destroy();
    peer?.destroy();
    socket.destroy();
  }
  // До проверок доступа: отказ тоже может совпасть со сбросом браузера.
  socket.on('error', error => { reportNetworkError('WebSocket браузера', error); closeTunnel(); });
  socket.on('close', closeTunnel);
  req.on('error', error => { reportNetworkError('запрос Upgrade', error); closeTunnel(); });
  upgradedSockets.add(socket);
  if (req.method !== 'GET' || req.headers.host !== origin.host || req.headers.origin !== origin.origin ||
      !hmrPaths.has(req.url?.split('?')[0]) || req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  upstream = upstreamRequest({ hostname: '127.0.0.1', port: upstreamPort, method: 'GET', path: req.url, headers: forwardedHeaders(req) });
  upstream.on('error', error => { reportNetworkError('Upgrade Next.js', error); closeTunnel(); });
  upstream.setTimeout(10_000, closeTunnel);
  upstream.on('response', response => {
    response.on('error', error => { reportNetworkError('отказ Upgrade Next.js', error); closeTunnel(); });
    response.on('aborted', closeTunnel);
    response.resume();
    if (closed || socket.destroyed || socket.writableEnded) { response.destroy(); return; }
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
    peer = upstreamSocket;
    upstream.setTimeout(0);
    socket.setTimeout(0);
    peer.setTimeout(0);
    peer.on('error', error => { reportNetworkError('WebSocket Next.js', error); closeTunnel(); });
    peer.on('close', closeTunnel);
    response.on('error', error => { reportNetworkError('ответ Upgrade Next.js', error); closeTunnel(); });
    if (closed || socket.destroyed || socket.writableEnded) { closeTunnel(); return; }
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
