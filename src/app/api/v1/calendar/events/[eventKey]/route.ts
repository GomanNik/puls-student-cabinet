import * as h from "@/modules/community/handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{eventKey:string}>}){return h.eventGet((await context.params).eventKey)(request);}
