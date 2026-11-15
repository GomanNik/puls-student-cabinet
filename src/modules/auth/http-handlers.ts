import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readConfig } from "@/shared/server/config";
import { database } from "@/shared/server/db";
import { AppError } from "@/shared/server/errors";
import { enforceOrigin, enforceTransport, errorResponse, jsonContent, parseStrictJson, privateHeaders, readBody, readToken, setSessionCookie } from "@/shared/server/http";
import { loginSchema, profileResponseSchema, sessionResponseSchema } from "@/shared/contracts/auth";
import { AuthService } from "./service";

export const authService = () => new AuthService(database(), readConfig());
export function authHandler(operation: "login" | "logout" | "me" | "profile") {
  return async (request: Request) => {
    const requestId = randomUUID();
    try {
      const config = readConfig();
      const ip = enforceTransport(request, config);
      if (operation === "login" || operation === "logout") enforceOrigin(request, config);
      const service = authService();
      const token = readToken(request);
      if (operation === "login") {
        jsonContent(request);
        const parsed = loginSchema.safeParse(parseStrictJson(await readBody(request, 4096)));
        if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", "Проверьте введённые данные.");
        const result = await service.login(parsed.data.login, parsed.data.password, ip, token, requestId);
        const response = NextResponse.json(sessionResponseSchema.parse({ data: result.data, meta: { requestId } }), { headers: privateHeaders });
        setSessionCookie(response, result.token, result.expires);
        return response;
      }
      if (operation === "logout") {
        await readBody(request, 0);
        await service.logout(token, requestId);
        const response = new NextResponse(null, { status: 204, headers: privateHeaders });
        setSessionCookie(response, ""); return response;
      }
      const context = await service.requireSession(token, requestId);
      const data = operation === "me" ? await service.session(context) : await service.profile(context);
      const schema = operation === "me" ? sessionResponseSchema : profileResponseSchema;
      return NextResponse.json(schema.parse({ data, meta: { requestId } }), { headers: privateHeaders });
    } catch (error) { return errorResponse(error, requestId); }
  };
}
