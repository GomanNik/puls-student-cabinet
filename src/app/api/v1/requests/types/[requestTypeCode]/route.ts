import * as h from "@/modules/operations/handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{requestTypeCode:string}>}){return h.typeGet((await context.params).requestTypeCode)(request);}
