import * as h from "@/modules/community/handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{announcementId:string}>}){return h.announcementGet((await context.params).announcementId)(request);}
