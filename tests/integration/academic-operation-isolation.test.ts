import { beforeAll,afterAll,describe,expect,it,vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { testDatabase,prepareTestDatabase } from "../support/database";
import { AuthService } from "@/modules/auth/service";
import { readConfig } from "@/shared/server/config";
import { OperationsService } from "@/modules/operations/service";
import { CommunityService } from "@/modules/community/service";
import { learningService } from "@/modules/learning/composition";
import { seedOperations } from "../../prisma/seed-operations";
import type { AuthContext } from "@/modules/auth/context";
import { consumeAccountBudget } from "@/shared/server/service-budget";
let db:PrismaClient,auth:AuthService,a:AuthContext,b:AuthContext;
vi.mock("@/shared/server/db",()=>({database:()=>db}));
describe("ТД-15: чужие идентификаторы не расширяют доступ (этап Б)",()=>{
  beforeAll(async()=>{
    db=testDatabase();const fixture=await prepareTestDatabase(db);auth=new AuthService(db,readConfig());
    const old=process.env.PULS_SEED_DEMO_OPERATIONS;process.env.PULS_SEED_DEMO_OPERATIONS="1";
    try{await seedOperations(db,fixture.ids);}finally{if(old===undefined)delete process.env.PULS_SEED_DEMO_OPERATIONS;else process.env.PULS_SEED_DEMO_OPERATIONS=old;}
    const sessions=await Promise.all([auth.login("demo-a",fixture.passwords[0],"127.0.0.1"),auth.login("demo-b",fixture.passwords[1],"127.0.0.1")]);
    [a,b]=await Promise.all(sessions.map(s=>auth.requireSession(s.token,randomUUID())));
  });
  afterAll(async()=>{await db?.$disconnect();});
  it("заявление, обращение и родитель сообщения Б недоступны А",async()=>{
    const sa=new OperationsService(a),sb=new OperationsService(b),request=(await sb.requests())[0],appeal=(await sb.appeals())[0];
    await expect(sa.request(request.id)).rejects.toMatchObject({status:404});
    await expect(sa.detail(appeal.id)).rejects.toMatchObject({status:404});
    await expect(sa.messages(appeal.id)).rejects.toMatchObject({status:404});
    await expect(sa.sendMessage(appeal.id,{body:"Запрещённая попытка"},randomUUID())).rejects.toMatchObject({status:404});
  });
  it("уведомление Б не меняет прочтение у А или Б",async()=>{
    const sb=new CommunityService(b),sa=new CommunityService(a),key=(await sb.notifications()).entries[0].item.notificationKey;
    const before=await db.$queryRaw`SELECT * FROM student_notification_state ORDER BY account_id,source_ref,event_occurrence_key`;
    await expect(sa.markRead([key])).rejects.toMatchObject({status:404});
    expect(await db.$queryRaw`SELECT * FROM student_notification_state ORDER BY account_id,source_ref,event_occurrence_key`).toEqual(before);
  });
  it("период, материал, работа и preview Б не открываются А",async()=>{
    const la=await learningService(a),lb=await learningService(b),material=(await lb.allMaterials({})).items[0];
    await expect(la.material(material.materialId)).rejects.toMatchObject({status:404});
    const period=lb.context.record.periods[0],periodId=lb.context.periodId(period),next=await lb.bindings(periodId).next();
    if(next.done)throw Error("Учебная fixture отсутствует");
    const binding=next.value;
    expect(()=>la.context.period(periodId)).toThrow();
    const work=(await lb.listWorks(binding,1)).data.items[0];
    await expect(la.targetPath(work.target)).rejects.toMatchObject({status:404});
    const selection={from:"2026-11-01",to:"2026-11-30",eventKinds:["UNIVERSITY","ACADEMIC"] as Array<"UNIVERSITY"|"ACADEMIC">};
    const token=(await new CommunityService(b).preview(selection)).selectionToken;
    await expect(new CommunityService(a).export(selection,token)).rejects.toMatchObject({status:409});
    const event=(await new CommunityService(b).calendar(selection)).items.find(i=>i.origin==="UNIVERSITY_EVENT")!;
    await expect(new CommunityService(a).event(event.eventKey,event.starts.on??"2026-11-17")).rejects.toMatchObject({status:404});
  });
  it("неполный профиль сохраняет известное имя и возвращает null",async()=>{
    const original=await db.studentProfile.findUniqueOrThrow({where:{accountId:b.accountId}});
    try{
      await db.studentProfile.update({where:{accountId:b.accountId},data:{facultyId:null,studyProgramId:null,academicGroupId:null,courseNumber:null}});
      expect(await auth.profile(b)).toEqual({fullName:original.fullName,faculty:null,studyProgram:null,course:null,group:null});
    }finally{await db.studentProfile.update({where:{accountId:b.accountId},data:{facultyId:original.facultyId,studyProgramId:original.studyProgramId,academicGroupId:original.academicGroupId,courseNumber:original.courseNumber}});}
  });
  it("лимит поиска А не расходует бюджет Б за тем же NAT",async()=>{
    await db.authRateBucket.deleteMany();
    for(let n=0;n<30;n++)await consumeAccountBudget(a,"SEARCH");
    await expect(consumeAccountBudget(a,"SEARCH")).rejects.toMatchObject({status:429,retryAfter:expect.any(Number)});
    await expect(consumeAccountBudget(b,"SEARCH")).resolves.toBeUndefined();
  });
});
