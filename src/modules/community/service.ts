import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuthContext } from "@/modules/auth/context";
import { assertAuthContext } from "@/modules/auth/context";
import { learningService } from "@/modules/learning/composition";
import { audienceAllowed } from "@/modules/student-context/scope";
import { announcementFixture, eventFixture } from "@/server/integrations/community-fixture";
import type { Audience } from "@/server/integrations/contracts";
import * as C from "@/shared/contracts/student-api";
import { addDays, localDay } from "@/shared/lib/dates";
import { opaqueRef, pageSlice } from "@/shared/server/references";
import { readConfig } from "@/shared/server/config";
import { AppError } from "@/shared/server/errors";
import { notFound } from "@/shared/server/route";
import { Prisma, rows, run } from "@/shared/server/sql";
import { database } from "@/shared/server/db";
import { transaction } from "@/shared/server/transaction";
import { lockAndRevalidateSession } from "@/shared/server/session-guard";

import { consumeAccountBudget } from "@/shared/server/service-budget";

export const categories=["ANNOUNCEMENT","ACADEMIC_DEADLINE","SCHEDULE_CHANGE","APPEAL_REPLY","REQUEST_STATUS"] as const;
export type Selection={from:string;to:string;eventKinds:Array<"UNIVERSITY"|"ACADEMIC">};
type Tuple={sourceKind:string;sourceRef:string;category:C.Notification["category"];occurrence:string};
type FeedEntry={item:C.Notification;tuple:Tuple};
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const calendarDay=(date:C.AcademicDate)=>date.on??localDay(date.at!,date.timeZone!);
export class CommunityService {
  private learning?:ReturnType<typeof learningService>;
  constructor(readonly auth:AuthContext,private db=database()){assertAuthContext(auth);}
  learn(){return this.learning??=learningService(this.auth,this.db);}
  meta(complete:boolean,byDataset?:C.ResponseMeta["completenessByDataset"]):C.ResponseMeta{return {requestId:this.auth.requestId,sourceStatus:complete?"READY":"PARTIAL",completeness:complete,...(byDataset?{completenessByDataset:byDataset}:{})};}
  private async allowed(audiences:Audience[],on:string){
    const {context}=await this.learn();
    const period=context.record.periods.find(p=>(!p.startsOn||p.startsOn<=on)&&(!p.endsOn||p.endsOn>=on));
    for(const a of audiences){
      if(a.sourceRef&&a.sourceRef.sourceCode!==context.identity.sourceCode)continue;
      if(a.scopeType==="UNIVERSITY"&&a.scopeId===context.identity.sourceCode)return true;
      if(a.scopeType==="STUDENT"&&a.scopeId===context.identity.externalStudentId)return true;
      if(a.scopeType==="FACULTY"&&a.scopeId===context.record.facultyId)return true;
      if(a.scopeType==="GROUP"&&a.scopeId===context.record.groupId)return true;
      if(a.scopeType==="PROGRAM_COURSE"&&a.scopeId===`${context.record.programId}:${context.record.course}`)return true;
      if(period&&(a.scopeType==="OFFERING"||a.scopeType==="SUBGROUP")&&audienceAllowed(await context.resolve(period,on),a,a.offeringId))return true;
    }return false;
  }
  private announcementsSnapshot?:ReturnType<CommunityService["loadAnnouncements"]>;
  announcements(){return this.announcementsSnapshot??=this.loadAnnouncements();}
  private async loadAnnouncements(){
    const {context}=await this.learn(),read=announcementFixture(context.identity);
    if(read.sourceCode!==context.identity.sourceCode||read.requestedScope.externalStudentId!==context.identity.externalStudentId)throw new AppError(502,"EXTERNAL_INVALID_RESPONSE","Область объявлений не подтверждена.");
    const items:Array<{item:C.Announcement;tuple:Tuple}>=[];let complete=read.isComplete===true&&read.availability!=="ERROR"&&!context.partial;
    const seen=new Set<string>();
    for(const raw of read.items){
      if(raw.ref.sourceCode!==read.sourceCode||seen.has(raw.announcementId)){complete=false;continue;}seen.add(raw.announcementId);
      if(!await this.allowed(raw.audiences,context.today))continue;
      if(raw.publishedAt&&Date.parse(raw.publishedAt)>Date.now())continue;
      const item:C.Announcement={announcementId:context.id("announcement",raw.announcementId),title:raw.title,...(raw.body?{body:raw.body}:{}),...(raw.publishedAt?{publishedAt:raw.publishedAt}:{}),...(raw.authorLabel?{authorLabel:raw.authorLabel}:{})};
      items.push({item,tuple:{sourceKind:"ANNOUNCEMENT",sourceRef:JSON.stringify([read.sourceCode,raw.ref]),category:"ANNOUNCEMENT",occurrence:raw.eventOccurrenceKey}});
    }
    items.sort((a,b)=>(b.item.publishedAt??"").localeCompare(a.item.publishedAt??"")||a.item.announcementId.localeCompare(b.item.announcementId));
    return {items,complete,revision:read.sourceRevision};
  }
  async announcement(id:string){const s=await this.announcements(),item=s.items.find(r=>r.item.announcementId===id)?.item;if(!item){if(!s.complete)throw new AppError(503,"EXTERNAL_UNAVAILABLE","Объявления временно недоступны.");throw notFound();}return item;}
  private academicSnapshot?:ReturnType<CommunityService["loadAcademic"]>;
  academic(){return this.academicSnapshot??=this.loadAcademic();}
  private async loadAcademic(){
    const learning=await this.learn(),items:C.CalendarItem[]=[];let complete=!learning.context.partial;
    for await(const binding of learning.bindings()){
      try{const result=await learning.calendarFacts(binding);complete&&=result.complete;for(const fact of result.facts)items.push({eventKey:learning.context.id("calendar",fact.kind,fact.id),origin:fact.kind,title:fact.title,starts:fact.date,target:fact.target,...(fact.location?{location:fact.location}:{})});}
      catch{complete=false;}
    }return {items,complete:complete&&!learning.context.partial,revision:learning.context.revision};
  }
  async calendar(selection:Selection){
    const items:C.CalendarItem[]=[],revisions:string[]=[],completenessByDataset:C.ResponseMeta["completenessByDataset"]={};let complete=true;
    if(selection.eventKinds.includes("UNIVERSITY")){
      try{const {context}=await this.learn(),read=eventFixture(context.identity);
        if(read.sourceCode!==context.identity.sourceCode||read.requestedScope.externalStudentId!==context.identity.externalStudentId)throw Error("Scope mismatch");
        completenessByDataset.calendar=read.isComplete===true&&read.availability!=="ERROR"&&!context.partial;revisions.push(read.sourceRevision??"unversioned");
        const seen=new Set<string>();
        for(const raw of read.items){const canonical=JSON.stringify([raw.eventId,raw.eventOccurrenceId]);if(raw.ref.sourceCode!==read.sourceCode||seen.has(canonical)){completenessByDataset.calendar=false;continue;}seen.add(canonical);if(!await this.allowed(raw.audiences,calendarDay(raw.starts)))continue;
          const eventKey=context.id("calendar","UNIVERSITY_EVENT",raw.eventId,raw.eventOccurrenceId);
          items.push({eventKey,origin:"UNIVERSITY_EVENT",title:raw.title,starts:raw.starts,target:{kind:"CALENDAR_EVENT",targetRef:eventKey},...(raw.ends?{ends:raw.ends}:{}),...(raw.description?{description:raw.description}:{}),...(raw.location?{location:raw.location}:{})});}
      }catch{completenessByDataset.calendar=false;}
      complete&&=completenessByDataset.calendar===true;
    }
    if(selection.eventKinds.includes("ACADEMIC")){
      try{const result=await this.academic();items.push(...result.items);completenessByDataset.deadlines=result.complete;completenessByDataset.attestation=result.complete;revisions.push(result.revision);}catch{completenessByDataset.deadlines=false;completenessByDataset.attestation=false;}
      complete&&=completenessByDataset.deadlines===true;
    }
    const selected=items.filter(item=>calendarDay(item.starts)<=selection.to&&calendarDay(item.ends??item.starts)>=selection.from).sort((a,b)=>calendarDay(a.starts).localeCompare(calendarDay(b.starts))||(a.starts.at??"").localeCompare(b.starts.at??"")||a.eventKey.localeCompare(b.eventKey));
    if(selected.length>2000)throw new AppError(413,"PAYLOAD_TOO_LARGE","Выберите меньший диапазон календаря: не более 2000 событий.");
    return {items:selected,complete,revision:digest([revisions,selected]),meta:this.meta(complete,completenessByDataset)};
  }
  async event(key:string,on:string){const snapshot=await this.calendar({from:on,to:on,eventKinds:["UNIVERSITY","ACADEMIC"]}),item=snapshot.items.find(i=>i.eventKey===key);if(!item){if(!snapshot.complete)throw new AppError(503,"EXTERNAL_UNAVAILABLE","Часть календаря недоступна.");throw notFound();}return item;}
  async eventPath(key:string){const {context}=await this.learn(),starts=context.record.periods.flatMap(p=>p.startsOn?[p.startsOn]:[]),ends=context.record.periods.flatMap(p=>p.endsOn?[p.endsOn]:[]),from=[context.today,...starts].sort()[0],to=[addDays(context.today,366),...ends].sort().at(-1)!;const snapshot=await this.calendar({from,to,eventKinds:["UNIVERSITY"]}),item=snapshot.items.find(i=>i.eventKey===key);if(!item){if(!snapshot.complete)throw new AppError(503,"EXTERNAL_UNAVAILABLE","Календарный источник недоступен.");throw notFound();}return `/calendar/events/${item.eventKey}?on=${calendarDay(item.starts)}`;}
  page<T>(items:T[],filter:unknown,complete:boolean,limit:number,cursor?:string){return {...pageSlice(items,this.auth.accountId,filter,digest(items),limit,cursor),isComplete:complete,dataState:items.length?"READY" as const:complete?"EMPTY_CONFIRMED" as const:"UNKNOWN" as const};}
  private sign(selection:Selection,revision:string,expires:number){return createHmac("sha256",readConfig().AUTH_RATE_LIMIT_HMAC_KEY).update(JSON.stringify(["calendar-v1",this.auth.accountId,selection,revision,expires])).digest("base64url");}
  private exportable(snapshot:{complete:boolean;items:C.CalendarItem[]}){if(!snapshot.complete)throw new AppError(503,"SOURCE_INCOMPLETE","Экспорт недоступен: часть выбранных источников не подтверждена.");if(!snapshot.items.length)throw new AppError(422,"CALENDAR_SELECTION_EMPTY","В выбранном диапазоне нет событий.");}
  async preview(selection:Selection):Promise<C.CalendarSelectionPreview>{await consumeAccountBudget(this.auth,"EXPORT_PREVIEW");const snapshot=await this.calendar(selection);this.exportable(snapshot);const expires=Date.now()+300_000;return {count:snapshot.items.length,selectionToken:`${expires}.${this.sign(selection,snapshot.revision,expires)}`,expiresAt:new Date(expires).toISOString(),filterSummary:selection};}
  async export(selection:Selection,token:string){const snapshot=await this.calendar(selection);this.exportable(snapshot);const [raw,signature,extra]=token.split("."),expires=Number(raw),expected=this.sign(selection,snapshot.revision,expires);if(extra||!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+300_000||!signature||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new AppError(409,"CALENDAR_SELECTION_CHANGED","Выборка изменилась или срок подтверждения истёк. Повторите предпросмотр.");return snapshot.items;}
  private entry(tuple:Tuple,data:Omit<C.Notification,"notificationKey"|"category"|"isRead">):FeedEntry{return {tuple,item:{...data,category:tuple.category,isRead:false,notificationKey:opaqueRef(this.auth.accountId,"NOTIFICATIONS","v1",tuple.sourceKind,tuple.sourceRef,tuple.category,tuple.occurrence)}};}
  async notifications(){
    const entries:FeedEntry[]=[],completenessByCategory:NonNullable<C.ResponseMeta["completenessByCategory"]>={};
    for(const category of categories){try{
      if(category==="ANNOUNCEMENT"){const result=await this.announcements();completenessByCategory[category]=result.complete;for(const {item,tuple} of result.items)entries.push(this.entry(tuple,{title:item.title,...(item.body?{bodyPreview:item.body.slice(0,200)}:{}),...(item.publishedAt?{occurredAt:item.publishedAt}:{}),target:{kind:"ANNOUNCEMENT",targetRef:item.announcementId}}));}
      if(category==="ACADEMIC_DEADLINE"){const result=await this.academic();completenessByCategory[category]=result.complete;for(const item of result.items.filter(i=>i.origin==="ACADEMIC_DEADLINE"))entries.push(this.entry({sourceKind:"ACADEMIC_DEADLINE",sourceRef:item.eventKey,category,occurrence:digest(item.starts)},{title:item.title,bodyPreview:`Срок: ${calendarDay(item.starts)}${item.starts.precision==="DATE_ONLY"?" (время не задано)":""}`,target:item.target}));}
      if(category==="SCHEDULE_CHANGE"){
        const learning=await this.learn();completenessByCategory[category]=!learning.context.partial;const seen=new Set<string>();
        for(const p of learning.context.record.periods){if(!p.startsOn||!p.endsOn){completenessByCategory[category]=false;continue;}for(let from=p.startsOn;from<=p.endsOn;from=addDays(from,31)){const to=addDays(from,30)<p.endsOn?addDays(from,30):p.endsOn;let cursor:string|undefined;do{const page=await learning.schedule.list({from,to},100,cursor);completenessByCategory[category]&&=page.meta.completeness===true;
          for(const s of page.data.items){if(!s.change||seen.has(s.change.changeKey))continue;seen.add(s.change.changeKey);if(!s.change.revision){completenessByCategory[category]=false;continue;}entries.push(this.entry({sourceKind:"SCHEDULE",sourceRef:s.scheduleId,category,occurrence:s.change.changeKey},{title:`Изменение расписания: ${s.title}`,...(s.change.description?{bodyPreview:s.change.description.slice(0,200)}:{}),...(s.change.occurredAt?{occurredAt:s.change.occurredAt}:{}),target:s.target}));}
          cursor=page.data.nextCursor??undefined;
        }while(cursor);}}
      }
      if(category==="APPEAL_REPLY"){
        const replies=await rows<{message_id:string;appeal_id:string;subject:string;body:string;created_at:Date}>(Prisma.sql`SELECT m.message_id,m.appeal_id,a.subject,m.body,m.created_at FROM appeal_message m JOIN student_appeal a USING(appeal_id) WHERE a.owner_account_id=${this.auth.accountId}::uuid AND m.sender_kind_code='EXTERNAL_PARTY' ORDER BY m.created_at DESC LIMIT 5001`,this.db);
        completenessByCategory[category]=true;for(const r of replies)entries.push(this.entry({sourceKind:"APPEAL_MESSAGE",sourceRef:r.appeal_id,category,occurrence:r.message_id},{title:`Ответ: ${r.subject}`,bodyPreview:r.body.slice(0,200),occurredAt:r.created_at.toISOString(),target:{kind:"APPEAL",targetRef:r.appeal_id}}));
      }
      if(category==="REQUEST_STATUS"){
        const changes=await rows<{request_id:string;transition_id:string;to_state_code:string;changed_at:Date;display_name:string}>(Prisma.sql`SELECT t.request_id,t.transition_id,t.to_state_code,t.changed_at,c.display_name FROM request_state_transition t JOIN student_request r USING(request_id) JOIN request_type_catalog c USING(request_type_id) WHERE r.owner_account_id=${this.auth.accountId}::uuid AND t.state_dimension_code='BUSINESS' ORDER BY t.changed_at DESC LIMIT 5001`,this.db);
        const labels:Record<string,string>={SUBMITTED:"Отправлена",IN_PROGRESS:"В работе",READY:"Готово",REJECTED:"Отклонена"};completenessByCategory[category]=true;for(const r of changes)entries.push(this.entry({sourceKind:"REQUEST",sourceRef:r.request_id,category,occurrence:r.transition_id},{title:`${r.display_name}: ${labels[r.to_state_code]}`,occurredAt:r.changed_at.toISOString(),target:{kind:"REQUEST",targetRef:r.request_id}}));
      }
    }catch{completenessByCategory[category]=false;}}
    if(entries.length>5000)throw new AppError(503,"SOURCE_INCOMPLETE","Лента превысила безопасный объём выборки.");
    const read=await rows<{source_kind_code:string;source_ref:string;category_code:string;event_occurrence_key:string}>(Prisma.sql`SELECT n.source_kind_code,n.source_ref,n.category_code,n.event_occurrence_key FROM student_notification_state n JOIN jsonb_to_recordset(${JSON.stringify(entries.map(e=>e.tuple))}::jsonb) AS wanted("sourceKind" text,"sourceRef" text,category text,occurrence text) ON n.source_kind_code=wanted."sourceKind" AND n.source_ref=wanted."sourceRef" AND n.category_code=wanted.category AND n.event_occurrence_key=wanted.occurrence WHERE n.account_id=${this.auth.accountId}::uuid`,this.db);
    const key=(t:Tuple)=>JSON.stringify([t.sourceKind,t.sourceRef,t.category,t.occurrence]);const readKeys=new Set(read.map(r=>JSON.stringify([r.source_kind_code,r.source_ref,r.category_code,r.event_occurrence_key])));
    for(const e of entries)e.item.isRead=readKeys.has(key(e.tuple));
    const unique=[...new Map(entries.map(e=>[e.item.notificationKey,e])).values()].sort((a,b)=>(b.item.occurredAt??"").localeCompare(a.item.occurredAt??"")||a.item.notificationKey.localeCompare(b.item.notificationKey));
    const unavailableCategories=categories.filter(c=>completenessByCategory[c]!==true),complete=!unavailableCategories.length;
    return {entries:unique,complete,unavailableCategories,meta:{...this.meta(complete),completenessByCategory}};
  }
  async markRead(keys?:string[]){
    await consumeAccountBudget(this.auth,"NOTIFICATION_READ");
    const feed=await this.notifications(),selected=keys?feed.entries.filter(e=>keys.includes(e.item.notificationKey)):feed.entries;
    if(keys&&new Set(keys).size!==selected.length){if(!feed.complete)throw new AppError(503,"EXTERNAL_UNAVAILABLE","Часть уведомлений недоступна. Повторите позже.");throw notFound();}
    const markedCount=await transaction(this.db,async tx=>{
      await lockAndRevalidateSession(tx,this.auth);let marked=0;
      for(let offset=0;offset<selected.length;offset+=200){
        const values=selected.slice(offset,offset+200).map(({tuple:t})=>Prisma.sql`(${this.auth.accountId}::uuid,${t.sourceKind},${t.sourceRef},${t.category},${t.occurrence})`);
        marked+=await run(Prisma.sql`INSERT INTO student_notification_state(account_id,source_kind_code,source_ref,category_code,event_occurrence_key) VALUES ${Prisma.join(values)} ON CONFLICT(account_id,source_kind_code,source_ref,category_code,event_occurrence_key) DO NOTHING`,tx);
      }return marked;
    });
    return {markedCount,alreadyReadCount:selected.length-markedCount,completeness:feed.complete?"COMPLETE" as const:"PARTIAL" as const,unavailableCategories:feed.unavailableCategories};
  }
  async dashboard():Promise<C.DashboardResponse>{
    const data:C.DashboardView={nextClasses:[],upcomingWorks:[],upcomingDeadlines:[],announcements:[],notifications:[],materials:[],calendarHighlights:[]};
    const datasets:NonNullable<C.ResponseMeta["completenessByDataset"]>={},categoryFlags:NonNullable<C.ResponseMeta["completenessByCategory"]>={};let notificationsComplete=false;
    // Независимые блоки сохраняют свои данные и признак полноты при отказе соседнего.
    const results=await Promise.allSettled([
      (async()=>{datasets.schedule=false;const s=await this.learn(),from=s.context.today,to=addDays(from,7);let cursor:string|undefined;const items:C.ScheduleEntry[]=[];let complete=true;do{const page=await s.schedule.list({from,to},100,cursor);items.push(...page.data.items);complete&&=page.meta.completeness===true;cursor=page.data.nextCursor??undefined;}while(cursor);data.nextClasses=items.filter(x=>x.status!=="CANCELLED"&&(!x.plannedEnd||Date.parse(x.plannedEnd)>=Date.now())).sort((a,b)=>(a.plannedStart??"").localeCompare(b.plannedStart??"")||a.scheduleId.localeCompare(b.scheduleId)).slice(0,3);datasets.schedule=complete;})(),
      (async()=>{datasets.deadlines=false;const learning=await this.learn(),snapshot=await this.academic(),to=addDays(learning.context.today,13);data.upcomingDeadlines=snapshot.items.filter(i=>calendarDay(i.starts)>=learning.context.today&&calendarDay(i.starts)<=to).sort((a,b)=>calendarDay(a.starts).localeCompare(calendarDay(b.starts))||a.title.localeCompare(b.title,"ru-RU")||a.eventKey.localeCompare(b.eventKey)).slice(0,4);datasets.deadlines=snapshot.complete;})(),
      (async()=>{datasets.work=false;const s=await this.learn(),period=s.context.currentPeriod();if(!period)return;let complete=true;const items:C.WorkSummary[]=[];for await(const binding of s.bindings(s.context.periodId(period))){let cursor:string|undefined;do{const page=await s.listWorks(binding,100,cursor);complete&&=page.meta.completeness===true;items.push(...page.data.items.filter(w=>w.due&&calendarDay(w.due)>=s.context.today&&calendarDay(w.due)<=addDays(s.context.today,13)));cursor=page.data.nextCursor??undefined;}while(cursor);}items.sort((a,b)=>calendarDay(a.due!).localeCompare(calendarDay(b.due!))||a.workId.localeCompare(b.workId));data.upcomingWorks=items.slice(0,4);datasets.work=complete&&!s.context.partial;})(),
      (async()=>{datasets.material=false;const s=await this.learn(),period=s.context.currentPeriod(),materials=await s.allMaterials(period?{periodId:s.context.periodId(period)}:{});data.materials=materials.items.slice(0,4);datasets.material=materials.meta.completeness===true;})(),
      (async()=>{datasets.calendar=false;const s=await this.learn(),calendar=await this.calendar({from:s.context.today,to:addDays(s.context.today,30),eventKinds:["UNIVERSITY","ACADEMIC"]});data.calendarHighlights=calendar.items.filter(i=>i.origin==="UNIVERSITY_EVENT").slice(0,2);datasets.calendar=calendar.complete;})(),
      (async()=>{datasets.announcements=false;const a=await this.announcements();data.announcements=a.items.slice(0,2).map(x=>x.item);datasets.announcements=a.complete;})(),
      (async()=>{const n=await this.notifications();data.notifications=n.entries.filter(x=>!x.item.isRead).slice(0,3).map(x=>x.item);Object.assign(categoryFlags,n.meta.completenessByCategory);notificationsComplete=n.complete;})(),
    ]);
    const complete=results.every(r=>r.status==="fulfilled")&&Object.values(datasets).every(Boolean)&&notificationsComplete;
    return {data,meta:{...this.meta(complete,datasets),completenessByCategory:categoryFlags}};
  }
}
