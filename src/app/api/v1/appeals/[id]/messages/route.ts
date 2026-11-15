import * as h from "@/modules/operations/handlers";
export const runtime="nodejs";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return h.messagesGet((await context.params).id)(request);}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return h.messagePost((await context.params).id)(request);}
