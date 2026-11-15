import * as h from "@/modules/community/handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{notificationKey:string}>}){return h.notificationGet((await context.params).notificationKey)(request);}
