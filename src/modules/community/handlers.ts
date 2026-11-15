import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import * as C from "@/shared/contracts/student-api";
import { readRoute, query, pagingQuery, emptyQuery, notFound } from "@/shared/server/route";
import { commandRoute } from "@/shared/server/command";
import { daysBetween } from "@/shared/lib/dates";
import { CommunityService, categories } from "./service";
import { serializeCalendar } from "./export";
import { authService } from "@/modules/auth/http-handlers";
import { readConfig } from "@/shared/server/config";
import { enforceTransport,errorResponse,privateHeaders,readToken } from "@/shared/server/http";
import { AppError } from "@/shared/server/errors";
import { withExportBudget } from "@/shared/server/service-budget";
import { securityAudit } from "@/shared/server/security-audit";
const selectionFields={from:z.iso.date(),to:z.iso.date(),eventKinds:z.string().default("UNIVERSITY,ACADEMIC").transform((s,ctx)=>{const kinds=s.split(",");if(!kinds.length||new Set(kinds).size!==kinds.length||kinds.some(k=>k!=="UNIVERSITY"&&k!=="ACADEMIC")){ctx.addIssue({code:"custom",message:"Выберите категории календаря."});return z.NEVER;}return kinds.sort() as Array<"UNIVERSITY"|"ACADEMIC">;})};
const validRange=(p:{from:string;to:string})=>daysBetween(p.from,p.to)>=0&&daysBetween(p.from,p.to)<366;
export const announcementsGet=readRoute(C.AnnouncementListResponseSchema,async(auth,request)=>{const p=query(request,z.strictObject(pagingQuery)),s=new CommunityService(auth),a=await s.announcements();return {data:s.page(a.items.map(x=>x.item),{announcements:true},a.complete,p.limit,p.cursor),meta:s.meta(a.complete,{announcements:a.complete})};});
export const announcementGet=(id:string)=>readRoute(C.AnnouncementDetailResponseSchema,async(auth,request)=>{query(request,emptyQuery);const s=new CommunityService(auth);return {data:await s.announcement(id),meta:s.meta(true)};});
export const notificationsGet=readRoute(C.NotificationListResponseSchema,async(auth,request)=>{const p=query(request,z.strictObject({...pagingQuery,category:z.enum(categories).optional(),unreadOnly:z.enum(["true","false"]).default("false").transform(v=>v==="true")})),s=new CommunityService(auth),n=await s.notifications(),items=n.entries.map(e=>e.item).filter(i=>(!p.category||i.category===p.category)&&(!p.unreadOnly||!i.isRead));return {data:s.page(items,{notifications:true,category:p.category,unreadOnly:p.unreadOnly},n.complete,p.limit,p.cursor),meta:n.meta};});
export const notificationGet=(key:string)=>readRoute(C.NotificationDetailResponseSchema,async(auth,request)=>{query(request,emptyQuery);const s=new CommunityService(auth),n=await s.notifications(),data=n.entries.find(e=>e.item.notificationKey===key)?.item;if(!data){if(!n.complete)throw new AppError(503,"EXTERNAL_UNAVAILABLE","Часть уведомлений недоступна.");throw notFound();}return {data,meta:n.meta};});
export const readPost=commandRoute(C.MarkReadRequestSchema,C.ReadResponseSchema,async(auth,input)=>{const s=new CommunityService(auth),r=await s.markRead(input.notificationKeys);return {body:{data:{markedCount:r.markedCount,alreadyReadCount:r.alreadyReadCount},meta:s.meta(r.completeness==="COMPLETE")}};});
export const readAllPost=commandRoute(z.strictObject({}),C.ReadAllResponseSchema,async auth=>{const s=new CommunityService(auth),data=await s.markRead();return {body:{data,meta:s.meta(data.completeness==="COMPLETE")}};});
export const calendarGet=readRoute(C.CalendarListResponseSchema,async(auth,request)=>{const p=query(request,z.strictObject({...selectionFields,...pagingQuery}).refine(validRange)),s=new CommunityService(auth),selection={from:p.from,to:p.to,eventKinds:p.eventKinds},snapshot=await s.calendar(selection);return {data:s.page(snapshot.items,selection,snapshot.complete,p.limit,p.cursor),meta:snapshot.meta};});
export const eventGet=(key:string)=>readRoute(C.CalendarEventResponseSchema,async(auth,request)=>{const p=query(request,z.strictObject({on:z.iso.date()})),s=new CommunityService(auth);return {data:await s.event(key,p.on),meta:s.meta(true)};});
export const previewGet=readRoute(C.CalendarPreviewResponseSchema,async(auth,request)=>{const p=query(request,z.strictObject(selectionFields).refine(validRange)),s=new CommunityService(auth);return {data:await s.preview(p),meta:s.meta(true)};});
export const dashboardGet=readRoute(C.DashboardResponseSchema,async(auth,request)=>{query(request,emptyQuery);return new CommunityService(auth).dashboard();});
export async function exportGet(request:Request){
  const requestId=randomUUID();
  try{
    enforceTransport(request,readConfig());
    const service=authService(),auth=await service.requireSession(readToken(request),requestId);
    const p=query(request,z.strictObject({...selectionFields,format:z.enum(["ics","pdf","xlsx"]),selectionToken:z.string().min(1).max(1024)}).refine(validRange)),selection={from:p.from,to:p.to,eventKinds:p.eventKinds};
    return await withExportBudget(auth,async()=>{
      const items=await new CommunityService(auth).export(selection,p.selectionToken),file=await serializeCalendar(items,selection,p.format);
      // Сессия могла завершиться за время генерации; бинарный ответ ещё не отправлен.
      await service.requireSession(readToken(request),requestId);
      await securityAudit("EXPORT_CREATED",{requestId,accountId:auth.accountId,target:"EXPORT"});
      return new Response(new Uint8Array(file.bytes),{headers:{...privateHeaders,"Content-Type":file.mime,"Content-Disposition":`attachment; filename="${file.filename}"`,"Content-Security-Policy":"sandbox"}});
    });
  }catch(error){await securityAudit("EXPORT_DENIED",{requestId,target:"EXPORT"});return errorResponse(error,requestId);}
}
