import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clientSessionScope, type AuthContext } from "@/modules/auth/context";
import { authService } from "@/modules/auth/http-handlers";
import { readConfig } from "./config";
import { enforceOrigin, enforceTransport, errorResponse, privateHeaders, readBody, readToken, parseStrictJson, jsonContent } from "./http";
import { securityAudit } from "./security-audit";
import { AppError } from "./errors";

export function commandRoute<I, O>(input: z.ZodType<I>, output: z.ZodType<O>, action: (auth: AuthContext, body: I, request: Request) => Promise<{ body: O; status?: number; location?: string }>) {
  return async (request: Request) => {
    const requestId = randomUUID();
    try {
      const config = readConfig(); enforceTransport(request, config); enforceOrigin(request, config);
      const auth = await authService().requireSession(readToken(request), requestId);
      jsonContent(request);
      const raw = await readBody(request, 32 * 1024);
      const parsed = input.safeParse(parseStrictJson(raw));
      if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", "Проверьте поля формы.");
      const result = await action(auth, parsed.data, request);
      const path=new URL(request.url).pathname;
      const code=path.includes("/notifications/read")?"NOTIFICATION_READ":null;
      if(code)await securityAudit(code,{requestId,accountId:auth.accountId});
      await authService().requireSession(readToken(request), requestId);
      return NextResponse.json(output.parse(result.body), { status: result.status ?? 200, headers: { ...privateHeaders, "X-Puls-Session-Scope": clientSessionScope(auth), ...(result.location ? { Location: result.location } : {}) } });
    } catch (error) { if(new URL(request.url).pathname==="/api/v1/assistant/ask")await securityAudit("ASSISTANT_BLOCKED",{requestId,target:"ASSISTANT"});return errorResponse(error, requestId); }
  };
}
export function intentionKey(request: Request) {
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new AppError(422, "VALIDATION_ERROR", "Не указан ключ отправки. Обновите форму.");
  return key.toLowerCase();
}
