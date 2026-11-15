import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { AdministrationFixture } from "../src/server/integrations/administration-fixture";
import { createAuthContext } from "../src/modules/auth/context";
import { CommunityService, categories } from "../src/modules/community/service";
import { demoStudents } from "./seed-data";

const source="UNIVERSITY_FIXTURE";
const id=(value:string)=>{const h=createHash("sha256").update(`puls-demo-v1:${value}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const hash=(v:string)=>createHash("sha256").update(v).digest();
const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`:JSON.stringify(typeof v==="string"?v.normalize("NFC"):v)??"null";

async function intention(tx:Prisma.TransactionClient,account:string,scope:string,key:string,payload:unknown,kind:string,result:string){
  await tx.$executeRaw`INSERT INTO idempotency_record(account_id,operation_scope_code,key_digest,request_hash,result_kind,result_id,expires_at) VALUES(${account}::uuid,${scope},${hash(key)},${hash(canonical(payload))},${kind},${result},now()+interval '24 hours') ON CONFLICT DO NOTHING`;
}
// Только явный операторский opt-in. Повторный seed добавляет отсутствующие
// демо-объекты, не сбрасывает существующие статусы, сообщения или прочтения.
export async function seedOperations(db:PrismaClient,accounts:string[]){
  if(process.env.PULS_SEED_DEMO_OPERATIONS!=="1")return;
  if((process.env.PULS_ADMIN_FIXTURE_SCENARIO??"normal")!=="normal")throw Error("Для seed административный источник должен быть normal");
  const port=new AdministrationFixture();
  for(const [i,account] of accounts.entries()){
    const student=demoStudents[i];
    await db.$transaction(async tx=>{
      const identities=await tx.studentExternalIdentity.findMany({where:{accountId:account,sourceCode:source,externalStudentId:student.externalStudentId}});
      if(identities.length!==1)throw Error("Demo identity mismatch");
      await tx.$queryRaw`SELECT account_id FROM student_account WHERE account_id=${account}::uuid FOR UPDATE`;
      for(const code of ["DEMO_APPLICATION","DEMO_CERTIFICATE"] as const){
        const request=id(`${account}:${code}`),operation=id(`${request}:operation`);
        if((await tx.$queryRaw<unknown[]>`SELECT request_id FROM student_request WHERE request_id=${request}::uuid`).length)continue;
        const now=new Date(),start=new Date(+now-(code==="DEMO_CERTIFICATE"?120_000:45_000));
        const data=code==="DEMO_CERTIFICATE"?{copies:1,presentationPlace:"Вымышленная учебная организация"}:{subject:"Уточнение порядка обучения",statementBody:"Прошу уточнить демонстрационный порядок подготовки индивидуального учебного проекта."};
        const input={requestTypeCode:code,formSchemaVersion:"v1" as const,submittedData:data};
        const ack=port.request({sourceCode:source,operationId:operation,correlationId:operation,externalStudentId:student.externalStudentId,...input},start,now);
        await tx.$executeRaw`INSERT INTO student_request(request_id,owner_account_id,request_type_id,form_schema_version,submitted_data,business_status_code,created_at,submitted_at) SELECT ${request}::uuid,${account}::uuid,request_type_id,'v1',${JSON.stringify(data)}::jsonb,${ack.businessStatus},${start},${start} FROM request_type_catalog WHERE request_type_code=${code}`;
        await tx.$executeRaw`INSERT INTO request_external_operation(operation_id,request_id,source_code,operation_kind_code,correlation_id,external_operation_id,external_state_code,started_at,completed_at,last_seen_source_revision,last_source_updated_at,next_poll_at) VALUES(${operation}::uuid,${request}::uuid,${source},'SUBMIT',${operation},${ack.externalOperationId},'ACKNOWLEDGED',${start},${now},${ack.sourceRevision},${new Date(ack.sourceUpdatedAt!)},${ack.businessStatus==="READY"?null:new Date(+now+15_000)})`;
        await tx.$executeRaw`INSERT INTO request_external_attempt(operation_id,attempt_number,outcome_code,started_at,completed_at) VALUES(${operation}::uuid,1,'ACKNOWLEDGED',${start},${now})`;
        let from:string|null=null;
        for(const t of ack.transitions){await tx.$executeRaw`INSERT INTO request_state_transition(request_id,state_dimension_code,from_state_code,to_state_code,changed_at,change_source_code,event_occurrence_key) VALUES(${request}::uuid,'BUSINESS',${from},${t.businessStatus},${new Date(t.occurredAt)},${source},${t.eventOccurrenceKey})`;from=t.businessStatus;}
        await intention(tx,account,"CREATE_REQUEST",id(`${request}:key`),input,"REQUEST",request);
      }
      const appeal=id(`${account}:appeal`),operation=id(`${appeal}:operation`),first=id(`${appeal}:first`),second=id(`${appeal}:second`);
      if(!(await tx.$queryRaw<unknown[]>`SELECT appeal_id FROM student_appeal WHERE appeal_id=${appeal}::uuid`).length){
        const now=new Date(),start=new Date(+now-180_000),secondAt=new Date(+now-90_000);
        const input={categoryCode:"QUESTION" as const,subject:"Подготовка учебного проекта (демо)",firstMessage:"Здравствуйте! Подскажите порядок подготовки вымышленного учебного проекта."};
        const ack=port.appeal({sourceCode:source,operationId:operation,correlationId:operation,externalStudentId:student.externalStudentId,...input},start);
        await tx.$executeRaw`INSERT INTO student_appeal(appeal_id,owner_account_id,category_code,subject,created_at,submitted_at) VALUES(${appeal}::uuid,${account}::uuid,'QUESTION',${input.subject},${start},${start})`;
        await tx.$executeRaw`INSERT INTO appeal_external_operation(operation_id,appeal_id,source_code,operation_kind_code,correlation_id,external_appeal_id,external_state_code,started_at,completed_at,last_seen_source_revision,next_poll_at) VALUES(${operation}::uuid,${appeal}::uuid,${source},'SUBMIT',${operation},${ack.externalAppealId},'ACKNOWLEDGED',${start},${start},${ack.sourceRevision},now()+interval '30 seconds')`;
        await tx.$executeRaw`INSERT INTO appeal_external_attempt(operation_id,attempt_number,outcome_code,started_at,completed_at) VALUES(${operation}::uuid,1,'ACKNOWLEDGED',${start},${start})`;
        await tx.$executeRaw`INSERT INTO appeal_message(message_id,appeal_id,sender_kind_code,sender_account_id,sequence_number,body,created_at) VALUES(${first}::uuid,${appeal}::uuid,'STUDENT',${account}::uuid,1,${input.firstMessage},${start})`;
        const body="Спасибо! Уточните, пожалуйста, как представить список учебных источников.";
        await tx.$executeRaw`INSERT INTO appeal_message(message_id,appeal_id,sender_kind_code,sender_account_id,sequence_number,body,created_at) VALUES(${second}::uuid,${appeal}::uuid,'STUDENT',${account}::uuid,3,${body},${secondAt})`;
        const msg=port.message({sourceCode:source,externalStudentId:student.externalStudentId,externalAppealId:ack.externalAppealId!,messageId:second,correlationId:second,body});
        await tx.$executeRaw`INSERT INTO message_delivery_operation(message_id,source_code,remote_idempotency_key,delivery_state_code,external_message_id,created_at,updated_at) VALUES(${second}::uuid,${source},${second},'ACKNOWLEDGED',${msg.externalMessageId},${secondAt},${secondAt})`;
        await tx.$executeRaw`INSERT INTO message_delivery_attempt(message_id,source_code,attempt_number,delivery_state_code,attempted_at,completed_at,external_message_id) VALUES(${second}::uuid,${source},1,'ACKNOWLEDGED',${secondAt},${secondAt},${msg.externalMessageId})`;
        const replies=port.replies(source,student.externalStudentId,ack.externalAppealId!,[{messageId:first,acceptedAt:start},{messageId:second,acceptedAt:secondAt}],now);
        for(const [j,reply] of replies.entries())await tx.$executeRaw`INSERT INTO appeal_message(message_id,appeal_id,sender_kind_code,external_sender_ref,sequence_number,body,created_at,source_created_at,external_message_id,source_code) VALUES(${id(`${appeal}:reply-${j}`)}::uuid,${appeal}::uuid,'EXTERNAL_PARTY',${reply.senderLabel},${j===0?2:4},${reply.body},${new Date(reply.sourceCreatedAt)},${new Date(reply.sourceCreatedAt)},${reply.externalMessageId},${source})`;
        await intention(tx,account,"CREATE_APPEAL",id(`${appeal}:key`),input,"APPEAL",appeal);
        await intention(tx,account,"CREATE_APPEAL_MESSAGE",id(`${second}:key`),{appealId:appeal,body},"MESSAGE",second);
      }
    });
    // R-уведомления не копируются в P: сохраняются только индивидуальные
    // маркеры канонических occurrences, как при обычном прочтении.
    // Проекция R повторно проверяет живую сессию в БД. Краткоживущая
    // операторская сессия не выдаёт токен/cookie и удаляется даже при ошибке.
    // При аварии процесса expires_at закрывает её через пять минут.
    const now=new Date(),session=await db.authSession.create({data:{accountId:account,
      tokenDigest:new Uint8Array(randomBytes(32)),issuedAt:now,lastActivityAt:now,
      expiresAt:new Date(+now+5*60_000)}});
    try{
      const feed=await new CommunityService(createAuthContext(account,session.sessionId,"demo-seed"),db).notifications();
      for(const category of categories){
        const entry=feed.entries.find(e=>e.item.category===category);if(!entry)throw Error(`Demo category unavailable: ${category}`);
        const t=entry.tuple;
        await db.$executeRaw`INSERT INTO student_notification_state(account_id,source_kind_code,source_ref,category_code,event_occurrence_key) VALUES(${account}::uuid,${t.sourceKind},${t.sourceRef},${t.category},${t.occurrence}) ON CONFLICT DO NOTHING`;
      }
    }finally{
      await db.authSession.deleteMany({where:{sessionId:session.sessionId,accountId:account}});
    }
  }
}
