import * as h from "@/modules/operations/handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return h.requestGet((await context.params).id)(request);}
