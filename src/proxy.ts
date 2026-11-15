import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const nonce = randomBytes(24).toString("base64");
  // Загрузчик Next.js dev использует eval. В production разрешены только
  // собственные скрипты и nonce; исключение не зависит от входящих заголовков.
  const devScripts = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const csp = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-src blob:; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-${nonce}'${devScripts}; connect-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests`;
  if (!isApi) { headers.set("x-nonce", nonce); headers.set("Content-Security-Policy", csp); }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.append("Vary", "Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", request.nextUrl.pathname === "/login" ? "no-referrer" : "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Content-Security-Policy", isApi ? "default-src 'none'; frame-ancestors 'none'" : csp);
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
