// Публичные сертификаты НУЦ Минцифры для проверяемого TLS GigaChat.
// NODE_EXTRA_CA_CERTS задаётся до запуска Node.js, а не внутри приложения.
import { X509Certificate } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sources = [
  { name: "root", url: "https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt", fingerprint: "D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31" },
  { name: "sub", url: "https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt", fingerprint: "BB:BD:E2:10:3E:79:0B:99:9E:C6:2B:D0:3C:F6:25:A5:A2:E7:C3:16:E1:0A:FE:6A:49:0E:ED:EA:D8:B3:FD:9B" },
];

const certificates = [];
for (const source of sources) {
  const response = await fetch(source.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Не удалось получить сертификат ${source.name}: HTTP ${response.status}`);
  const pem = await response.text();
  if (pem.length > 16_384 || !pem.includes("-----BEGIN CERTIFICATE-----")) throw new Error(`Недопустимый файл сертификата ${source.name}`);
  const certificate = new X509Certificate(pem);
  if (!certificate.ca || certificate.fingerprint256 !== source.fingerprint || Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now())
    throw new Error(`Сертификат ${source.name} не прошёл проверку`);
  certificates.push({ certificate, pem: pem.trim() });
}
if (!certificates[0].certificate.verify(certificates[0].certificate.publicKey) ||
    !certificates[1].certificate.verify(certificates[0].certificate.publicKey))
  throw new Error("Подписи сертификатов не прошли проверку");

const output = resolve(".local/gigachat-ca.pem");
await mkdir(resolve(".local"), { recursive: true });
await writeFile(output, certificates.map(item => item.pem).join("\n") + "\n", { mode: 0o600 });
process.stdout.write(`Проверенный публичный набор сертификатов сохранён: ${output}\n`);
