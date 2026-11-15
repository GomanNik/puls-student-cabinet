import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "@/shared/server/db";
import { transaction } from "@/shared/server/transaction";
import { Prisma, rows, run } from "@/shared/server/sql";
import { AdministrationFixture } from "@/server/integrations/administration-fixture";
import type * as S from "@/server/integrations/contracts";
import { AppError } from "@/shared/server/errors";

import { advanceRequest, type KnownTransition } from "./request-state";
import { securityAudit } from "@/shared/server/security-audit";

type Op = {operation_id:string;request_id?:string;appeal_id?:string;source_code:string;correlation_id:string;started_at:Date;external_appeal_id?:string|null;lease_token:string;external_state_code:string;last_source_updated_at?:Date|null;attempt_number?:number};
const port=new AdministrationFixture();
const retrySeconds=[10,60,300,900,3600];
async function claim(kind:"request"|"appeal") {
  const table=Prisma.raw(`${kind}_external_operation`),token=randomUUID();
  return transaction(database(),async tx=>{
    const [op]=await rows<Op>(Prisma.sql`SELECT * FROM ${table} WHERE (lease_until IS NULL OR lease_until<now()) AND external_state_code<>'PERMANENT_TECHNICAL_ERROR' AND ((external_state_code<>'ACKNOWLEDGED' AND next_attempt_at<=now()) OR (external_state_code='ACKNOWLEDGED' AND next_poll_at<=now())) ORDER BY COALESCE(next_poll_at,next_attempt_at),operation_id FOR UPDATE SKIP LOCKED LIMIT 1`,tx);
    if(!op) return null;
    const [claimed]=await rows<Op>(Prisma.sql`UPDATE ${table} SET lease_token=${token}::uuid,lease_until=now()+interval '60 seconds',started_at=COALESCE(started_at,now()),external_state_code=CASE WHEN external_state_code='ACKNOWLEDGED' THEN external_state_code ELSE 'SENDING' END WHERE operation_id=${op.operation_id}::uuid RETURNING *`,tx);
    if(op.external_state_code!=="ACKNOWLEDGED"){
      const attempts=Prisma.raw(`${kind}_external_attempt`);
      // Незавершённая попытка остаётся в истории при падении процесса.
      await run(Prisma.sql`UPDATE ${attempts} SET outcome_code='UNKNOWN',completed_at=now(),error_code='EXTERNAL_TIMEOUT' WHERE operation_id=${op.operation_id}::uuid AND completed_at IS NULL`,tx);
      const [next]=await rows<{n:number}>(Prisma.sql`SELECT COALESCE(max(attempt_number),0)+1 AS n FROM ${attempts} WHERE operation_id=${op.operation_id}::uuid`,tx);
      if(Number(next.n)>5){await run(Prisma.sql`UPDATE ${table} SET external_state_code='PERMANENT_TECHNICAL_ERROR',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE operation_id=${op.operation_id}::uuid`,tx);return null;}
      await run(Prisma.sql`INSERT INTO ${attempts}(operation_id,attempt_number,outcome_code) VALUES(${op.operation_id}::uuid,${Number(next.n)},'SENDING')`,tx);
      claimed.attempt_number=Number(next.n);
    }
    return claimed;
  });
}
async function processOperation(kind:"request"|"appeal",op:Op) {
  const table=Prisma.raw(`${kind}_external_operation`),attemptTable=Prisma.raw(`${kind}_external_attempt`),parentTable=Prisma.raw(`student_${kind}`),idColumn=Prisma.raw(`${kind}_id`),id=kind==="request"?op.request_id!:op.appeal_id!;
  try {
    const [parent]=await rows<{external_student_id:string;request_type_code:S.RequestSubmitCommand["requestTypeCode"];form_schema_version:"v1";submitted_data:S.RequestSubmitCommand["submittedData"];category_code:S.AppealSubmitCommand["categoryCode"];subject:string;first_message:string}>(Prisma.sql`SELECT p.*,i.external_student_id ${kind==="request"?Prisma.sql`,t.request_type_code`:Prisma.sql`,(SELECT body FROM appeal_message WHERE appeal_id=p.appeal_id AND sequence_number=1) AS first_message`} FROM ${parentTable} p JOIN student_external_identity i ON i.account_id=p.owner_account_id AND i.source_code=${op.source_code} ${kind==="request"?Prisma.sql`JOIN request_type_catalog t USING(request_type_id)`:Prisma.empty} WHERE p.${idColumn}=${id}::uuid AND (i.valid_from IS NULL OR i.valid_from<=CURRENT_DATE) AND (i.valid_to IS NULL OR i.valid_to>=CURRENT_DATE)`);
    if(!parent) throw Error("Identity unavailable");
    const common={sourceCode:op.source_code,operationId:op.operation_id,correlationId:op.correlation_id,externalStudentId:parent.external_student_id};
    const request=kind==="request"?port[op.external_state_code==="ACKNOWLEDGED"||(op.attempt_number??1)>1?"requestStatus":"request"]({...common,requestTypeCode:parent.request_type_code,formSchemaVersion:parent.form_schema_version,submittedData:parent.submitted_data},op.started_at):null;
    const appeal=kind==="appeal"?port[op.external_state_code==="ACKNOWLEDGED"||(op.attempt_number??1)>1?"appealStatus":"appeal"]({...common,categoryCode:parent.category_code,subject:parent.subject,firstMessage:parent.first_message},op.started_at):null;
    const response=request??appeal!;
    if(response.sourceCode!==op.source_code || response.operationId!==op.operation_id || response.correlationId!==op.correlation_id || response.transportState!=="ACKNOWLEDGED") throw Error("Invalid acknowledgement");
    const delivered=appeal?await rows<{messageId:string;acceptedAt:Date}>(Prisma.sql`SELECT m.message_id AS "messageId",CASE WHEN m.sequence_number=1 THEN ${op.started_at}::timestamptz ELSE d.updated_at END AS "acceptedAt" FROM appeal_message m LEFT JOIN message_delivery_operation d USING(message_id) WHERE m.appeal_id=${id}::uuid AND m.sender_kind_code='STUDENT' AND (m.sequence_number=1 OR d.delivery_state_code='ACKNOWLEDGED')`):[];
    const replies=appeal?port.replies(op.source_code,parent.external_student_id,appeal.externalAppealId!,delivered):[];
    const applied=await transaction(database(),async tx=>{
      const [fenced]=await rows<Op>(Prisma.sql`SELECT * FROM ${table} WHERE operation_id=${op.operation_id}::uuid AND lease_token=${op.lease_token}::uuid AND lease_until>now() FOR UPDATE`,tx);if(!fenced)return;
      let changed=op.external_state_code!=="ACKNOWLEDGED";
      if(request){
        const [current]=await rows<{business_status_code:string|null}>(Prisma.sql`SELECT business_status_code FROM student_request WHERE request_id=${id}::uuid FOR UPDATE`,tx);
        const known=await rows<KnownTransition>(Prisma.sql`SELECT event_occurrence_key,to_state_code,changed_at FROM request_state_transition WHERE request_id=${id}::uuid AND state_dimension_code='BUSINESS' ORDER BY changed_at`,tx);
        const sourceTime=new Date(request.sourceUpdatedAt??request.transitions.at(-1)?.occurredAt??0);
        const update=advanceRequest(current.business_status_code,known,request.transitions,sourceTime,fenced.last_source_updated_at??null);
        // Ответ должен сам согласовываться со своим последним переходом.
        if(request.transitions.length && request.transitions.at(-1)?.businessStatus!==request.businessStatus)throw Error("Inconsistent source status");
        for(const change of update.changes)await run(Prisma.sql`INSERT INTO request_state_transition(request_id,state_dimension_code,from_state_code,to_state_code,changed_at,change_source_code,reason_code,event_occurrence_key) VALUES(${id}::uuid,'BUSINESS',${change.from},${change.businessStatus},${new Date(change.occurredAt)},${op.source_code},${change.reason??null},${change.eventOccurrenceKey}) ON CONFLICT DO NOTHING`,tx);
        if(update.advanced){
          changed=true;
          await run(Prisma.sql`UPDATE student_request SET business_status_code=${update.status},rejection_reason=${update.changes.at(-1)?.reason??null},updated_at=now() WHERE request_id=${id}::uuid`,tx);
        }
        // Revision непрозрачна: high-water продвигается по времени источника,
        // включая новый снимок с тем же статусом. Равная дата не заменяет revision.
        if(!fenced.last_source_updated_at || +sourceTime>+fenced.last_source_updated_at)
          await run(Prisma.sql`UPDATE ${table} SET last_seen_source_revision=${request.sourceRevision??request.transitions.at(-1)?.sourceRevision??null},last_source_updated_at=${sourceTime} WHERE operation_id=${op.operation_id}::uuid`,tx);
        await run(Prisma.sql`UPDATE ${table} SET external_operation_id=${request.externalOperationId},completed_at=COALESCE(completed_at,now()),next_poll_at=${["READY","REJECTED"].includes(update.status??"")?null:new Date(Date.now()+15_000)} WHERE operation_id=${op.operation_id}::uuid`,tx);
      }
      if(appeal){
        await run(Prisma.sql`SELECT appeal_id FROM student_appeal WHERE appeal_id=${id}::uuid FOR UPDATE`,tx);
        for(const reply of replies){
          if(reply.ref.sourceCode!==op.source_code || reply.externalAppealId!==appeal.externalAppealId || reply.senderKind!=="EXTERNAL_PARTY") throw Error("Reply scope mismatch");
          const inserted=await run(Prisma.sql`INSERT INTO appeal_message(appeal_id,sender_kind_code,external_sender_ref,sequence_number,body,source_created_at,external_message_id,source_code) SELECT ${id}::uuid,'EXTERNAL_PARTY',${reply.senderLabel},COALESCE(max(sequence_number),0)+1,${reply.body},${new Date(reply.sourceCreatedAt)},${reply.externalMessageId},${op.source_code} FROM appeal_message WHERE appeal_id=${id}::uuid ON CONFLICT(source_code,external_message_id) DO NOTHING`,tx);
          if(inserted)changed=true;
          if(inserted) await run(Prisma.sql`UPDATE student_appeal SET updated_at=now() WHERE appeal_id=${id}::uuid`,tx);
        }
        await run(Prisma.sql`UPDATE ${table} SET external_appeal_id=${appeal.externalAppealId},last_seen_source_revision=${appeal.sourceRevision},next_poll_at=now()+interval '30 seconds',completed_at=now() WHERE operation_id=${op.operation_id}::uuid`,tx);
      }
      // Успешные read-poll не являются повторной отправкой команды.
      if(op.attempt_number) await run(Prisma.sql`UPDATE ${attemptTable} SET outcome_code='ACKNOWLEDGED',completed_at=now(),error_code=NULL WHERE operation_id=${op.operation_id}::uuid AND attempt_number=${op.attempt_number}`,tx);
      await run(Prisma.sql`UPDATE ${table} SET external_state_code='ACKNOWLEDGED',lease_until=NULL,lease_token=NULL,last_error_code=NULL,last_error_summary=NULL,updated_at=now() WHERE operation_id=${op.operation_id}::uuid`,tx);
      return changed;
    });
    if(applied)await securityAudit("REMOTE_STATUS_CONFIRMED",{target:kind==="request"?"REQUEST":"APPEAL"});
  }catch(error){
    const uncertain=error instanceof AppError&&error.code==="EXTERNAL_TIMEOUT",outcome=uncertain?"UNKNOWN":"RETRYABLE_ERROR",errorCode=uncertain?"EXTERNAL_TIMEOUT":"EXTERNAL_UNAVAILABLE";
    await securityAudit("REMOTE_DELIVERY_UNCERTAIN",{target:kind==="request"?"REQUEST":"APPEAL"});
    await transaction(database(),async tx=>{
      const active=await rows(Prisma.sql`SELECT operation_id FROM ${table} WHERE operation_id=${op.operation_id}::uuid AND lease_token=${op.lease_token}::uuid AND lease_until>now() FOR UPDATE`,tx);if(!active.length)return;
      const [counts]=await rows<{n:number;failures:bigint}>(Prisma.sql`SELECT COALESCE(max(attempt_number),0)+1 AS n,count(*) FILTER(WHERE outcome_code IN ('RETRYABLE_ERROR','UNKNOWN')) AS failures FROM ${attemptTable} WHERE operation_id=${op.operation_id}::uuid`,tx);
      const failure=op.attempt_number??Number(counts.failures)+1;
      if(op.attempt_number)await run(Prisma.sql`UPDATE ${attemptTable} SET outcome_code=${outcome},completed_at=now(),error_code=${errorCode},safe_error_summary='Не удалось подтвердить ответ тестового источника' WHERE operation_id=${op.operation_id}::uuid AND attempt_number=${op.attempt_number}`,tx);
      else await run(Prisma.sql`INSERT INTO ${attemptTable}(operation_id,attempt_number,outcome_code,completed_at,error_code,safe_error_summary) VALUES(${op.operation_id}::uuid,${Number(counts.n)},${outcome},now(),${errorCode},'Не удалось подтвердить ответ тестового источника')`,tx);
      // После ACK ошибки опроса не отменяют подтверждённый бизнес-статус.
      const state=op.external_state_code==="ACKNOWLEDGED"?"ACKNOWLEDGED":failure>=5?"PERMANENT_TECHNICAL_ERROR":outcome;
      const next=new Date(Date.now()+retrySeconds[Math.min(failure-1,4)]*1000);
      await run(Prisma.sql`UPDATE ${table} SET external_state_code=${state},last_error_code=${errorCode},last_error_summary='Ответ тестового источника не подтверждён',next_attempt_at=${next},next_poll_at=${next},lease_token=NULL,lease_until=NULL,updated_at=now() WHERE operation_id=${op.operation_id}::uuid`,tx);
    });
  }
}
async function messageTick(){
  const token=randomUUID();
  const claimed=await transaction(database(),async tx=>{
    const [r]=await rows<{delivery_operation_id:string;message_id:string;source_code:string;external_appeal_id:string;external_student_id:string;body:string;accepted_at:Date}>(Prisma.sql`SELECT d.*,o.external_appeal_id,i.external_student_id,m.body,COALESCE((SELECT min(attempted_at) FROM message_delivery_attempt h WHERE h.message_id=d.message_id AND h.source_code=d.source_code),now()) AS accepted_at FROM message_delivery_operation d JOIN appeal_message m USING(message_id) JOIN student_appeal a USING(appeal_id) JOIN appeal_external_operation o USING(appeal_id) JOIN student_external_identity i ON i.account_id=a.owner_account_id AND i.source_code=d.source_code WHERE d.delivery_state_code NOT IN ('ACKNOWLEDGED','PERMANENT_TECHNICAL_ERROR') AND d.next_attempt_at<=now() AND (d.lease_until IS NULL OR d.lease_until<now()) AND o.external_state_code='ACKNOWLEDGED' AND o.external_appeal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM appeal_message older JOIN message_delivery_operation pending ON pending.message_id=older.message_id WHERE older.appeal_id=m.appeal_id AND older.sequence_number<m.sequence_number AND pending.delivery_state_code NOT IN ('ACKNOWLEDGED','PERMANENT_TECHNICAL_ERROR')) AND (i.valid_from IS NULL OR i.valid_from<=CURRENT_DATE) AND (i.valid_to IS NULL OR i.valid_to>=CURRENT_DATE) ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1`,tx);
    if(!r)return null;
    await run(Prisma.sql`UPDATE message_delivery_attempt SET delivery_state_code='UNKNOWN',completed_at=now(),error_code='EXTERNAL_TIMEOUT' WHERE message_id=${r.message_id}::uuid AND source_code=${r.source_code} AND completed_at IS NULL`,tx);
    const [next]=await rows<{n:number}>(Prisma.sql`SELECT COALESCE(max(attempt_number),0)+1 AS n FROM message_delivery_attempt WHERE message_id=${r.message_id}::uuid AND source_code=${r.source_code}`,tx);
    const n=Number(next.n);
    if(n>5){await run(Prisma.sql`UPDATE message_delivery_operation SET delivery_state_code='PERMANENT_TECHNICAL_ERROR',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE delivery_operation_id=${r.delivery_operation_id}::uuid`,tx);return null;}
    await run(Prisma.sql`UPDATE message_delivery_operation SET lease_token=${token}::uuid,lease_until=now()+interval '60 seconds',delivery_state_code='SENDING' WHERE delivery_operation_id=${r.delivery_operation_id}::uuid`,tx);
    await run(Prisma.sql`INSERT INTO message_delivery_attempt(message_id,source_code,attempt_number,delivery_state_code) VALUES(${r.message_id}::uuid,${r.source_code},${n},'SENDING')`,tx);
    return {...r,attempt_number:n};
  });
  if(!claimed)return false;
  let ack:S.MessageOperationStatus|null=null;let uncertain=false;
  try{ack=port[claimed.attempt_number>1?"messageStatus":"message"]({sourceCode:claimed.source_code,messageId:claimed.message_id,correlationId:claimed.message_id,externalAppealId:claimed.external_appeal_id,externalStudentId:claimed.external_student_id,body:claimed.body},claimed.accepted_at);if(ack.sourceCode!==claimed.source_code||ack.messageId!==claimed.message_id||ack.externalAppealId!==claimed.external_appeal_id||ack.transportState!=="ACKNOWLEDGED")ack=null;}catch(error){uncertain=error instanceof AppError&&error.code==="EXTERNAL_TIMEOUT";ack=null;}
  const persisted=await transaction(database(),async tx=>{
    const active=await rows(Prisma.sql`SELECT delivery_operation_id FROM message_delivery_operation WHERE delivery_operation_id=${claimed.delivery_operation_id}::uuid AND lease_token=${token}::uuid AND lease_until>now() FOR UPDATE`,tx);if(!active.length)return;
    const n=claimed.attempt_number,state=ack?"ACKNOWLEDGED":n>=5?"PERMANENT_TECHNICAL_ERROR":uncertain?"UNKNOWN":"RETRYABLE_ERROR";
    await run(Prisma.sql`UPDATE message_delivery_attempt SET delivery_state_code=${state},completed_at=now(),external_message_id=${ack?.externalMessageId??null},error_code=${ack?null:uncertain?"EXTERNAL_TIMEOUT":"EXTERNAL_UNAVAILABLE"} WHERE message_id=${claimed.message_id}::uuid AND source_code=${claimed.source_code} AND attempt_number=${n}`,tx);
    await run(Prisma.sql`UPDATE message_delivery_operation SET delivery_state_code=${state},external_message_id=${ack?.externalMessageId??null},next_attempt_at=${new Date(Date.now()+retrySeconds[Math.min(n-1,4)]*1000)},lease_token=NULL,lease_until=NULL,last_error_code=${ack?null:uncertain?"EXTERNAL_TIMEOUT":"EXTERNAL_UNAVAILABLE"},updated_at=now() WHERE delivery_operation_id=${claimed.delivery_operation_id}::uuid`,tx);
    return true;
  });
  if(persisted)await securityAudit(ack?"REMOTE_STATUS_CONFIRMED":"REMOTE_DELIVERY_UNCERTAIN",{target:"MESSAGE"});
  return true;
}
export async function administrationTick(shouldStop:()=>boolean=()=>false){
  for(const kind of ["request","appeal"] as const){for(let n=0;n<20&&!shouldStop();n++){const op=await claim(kind);if(!op)break;await processOperation(kind,op);}}
  for(let n=0;n<20&&!shouldStop();n++)if(!await messageTick())break;
}
