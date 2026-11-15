import { cookies } from "next/headers";
import { notFound as showNotFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authService } from "@/modules/auth/http-handlers";
import { learningService } from "@/modules/learning/composition";
import { CommunityService } from "@/modules/community/service";
import { sessionCookie } from "@/shared/server/http";
import { AppError } from "@/shared/server/errors";
export default async function Page({ params, searchParams }: { params: Promise<{ targetRef: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { targetRef } = await params, query = await searchParams;
  const kind = z.enum(["OFFERING", "WORK", "UNIT", "ATTESTATION", "CALENDAR_EVENT"]).safeParse(query.kind);
  if (!kind.success) showNotFound();
  const auth = await authService().requireSession((await cookies()).get(sessionCookie)?.value, randomUUID());
  let destination: string;
  try { destination = kind.data === "CALENDAR_EVENT" ? await new CommunityService(auth).eventPath(targetRef) : await (await learningService(auth)).targetPath({ kind: kind.data, targetRef }); }
  catch (error) { if (error instanceof AppError && error.status === 404) showNotFound(); throw error; }
  redirect(destination);
}
