import * as h from "@/modules/operations/handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return h.statusGet((await context.params).id)(request);}
