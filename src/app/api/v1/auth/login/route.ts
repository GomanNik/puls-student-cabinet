import { authHandler } from "@/modules/auth/http-handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = authHandler("login");
