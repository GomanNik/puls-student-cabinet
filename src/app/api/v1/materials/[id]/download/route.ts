import { randomUUID } from "node:crypto";
import { authService } from "@/modules/auth/http-handlers";
import { learningService } from "@/modules/learning/composition";
import { fixtureMaterialContent } from "@/server/integrations/learning-assets";
import { enforceTransport, errorResponse, privateHeaders, readToken } from "@/shared/server/http";
import { readConfig } from "@/shared/server/config";
import { AppError } from "@/shared/server/errors";
import { emptyQuery, notFound, query } from "@/shared/server/route";

import { materialLease } from "@/shared/server/service-budget";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

async function download(request: Request, { params }: RouteContext, head: boolean): Promise<Response> {
  const requestId = randomUUID();
  let release:(()=>Promise<void>)|undefined;
  try {
    enforceTransport(request, readConfig());
    query(request, emptyQuery);
    const auth = await authService().requireSession(readToken(request), requestId);
    const service = await learningService(auth);
    // Для GET и HEAD действует одна и та же объектная ACL.
    const material = await service.material((await params).id);
    if (material.item.kind !== "FILE" || !material.raw.resourceHandle) throw notFound();

    // Range не поддерживается и не должен приводить к частичной отдаче.
    if (request.headers.has("range")) {
      throw new AppError(416, "RANGE_NOT_SUPPORTED", "Скачивание по частям не поддерживается.");
    }

    const lease=await materialLease(auth);release=lease.release;
    const content = fixtureMaterialContent(material.raw.resourceHandle);
    if (!content) throw new AppError(503,"EXTERNAL_UNAVAILABLE","Файл временно недоступен.");
    await authService().requireSession(readToken(request),requestId);
    await service.material((await params).id);
    if(Date.now()>=lease.deadline)throw new AppError(504,"EXTERNAL_TIMEOUT","Время получения файла истекло.");
    const filename = encodeURIComponent(content.filename)
      .replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const headers = {
      ...privateHeaders,
      "Content-Type": content.mime,
      "Content-Length": String(content.bytes.length),
      "Content-Disposition": `attachment; filename="${content.file}"; filename*=UTF-8''${filename}`,
      "Content-Security-Policy": "sandbox",
      "Accept-Ranges": "none",
    };
    if(head){await release();return new Response(null,{status:200,headers});}
    const finish=release;let offset=0;let timer:ReturnType<typeof setTimeout>;
    const stream=new ReadableStream<Uint8Array>({
      start(controller){timer=setTimeout(()=>{controller.error(new Error("Время скачивания истекло"));void finish();},Math.max(1,lease.deadline-Date.now()));},
      async pull(controller){
        if(request.signal.aborted){clearTimeout(timer);await finish();controller.error(new Error("Скачивание отменено"));return;}
        if(offset>=content.bytes.length){clearTimeout(timer);await finish();controller.close();return;}
        const end=Math.min(content.bytes.length,offset+64*1024);controller.enqueue(new Uint8Array(content.bytes.subarray(offset,end)));offset=end;
      },
      async cancel(){clearTimeout(timer);await finish();}
    });
    return new Response(stream,{status:200,headers});
  } catch (error) {
    if(release)await release();
    const response = await errorResponse(error, requestId);
    response.headers.set("Accept-Ranges", "none");
    if (head) return new Response(null, { status: response.status, headers: response.headers });
    return response;
  }
}

export const GET = (request: Request, context: RouteContext) => download(request, context, false);
export const HEAD = (request: Request, context: RouteContext) => download(request, context, true);
