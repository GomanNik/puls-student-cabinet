import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { assertAuthContext, type AuthContext } from "@/modules/auth/context";
import * as C from "@/shared/contracts/student-api";
import { database } from "@/shared/server/db";
import { AppError } from "@/shared/server/errors";
import { notFound } from "@/shared/server/route";
import { pageSlice } from "@/shared/server/references";
import { transaction } from "@/shared/server/transaction";
import { lockAndRevalidateSession } from "@/shared/server/session-guard";
import { Prisma, rows, run, type SqlClient } from "@/shared/server/sql";

import { securityAudit } from "@/shared/server/security-audit";

const hash = (value: string) => createHash("sha256").update(value).digest();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(typeof value === "string" ? value.normalize("NFC") : value) ?? "null";
}
type State = C.StudentRequest["externalState"];
type RequestRow = { request_id: string; request_type_code: C.StudentRequest["requestTypeCode"]; form_schema_version: "v1"; submitted_data: C.StudentRequest["submittedData"]; submitted_at: Date; business_status_code: C.StudentRequest["businessStatus"]; external_state_code: State; rejection_reason: string | null };
type AppealRow = { appeal_id: string; category_code: C.Appeal["categoryCode"]; subject: string; created_at: Date; external_state_code: State; last_message_at: Date | null };
type MessageRow = { message_id: string; appeal_id: string; sequence_number: bigint; sender_kind_code: C.Message["senderKind"]; body: string; created_at: Date; source_created_at: Date | null; delivery_state: State | null };
type Intent = { request_hash: Uint8Array; result_kind: "REQUEST" | "APPEAL" | "MESSAGE"; result_id: string; expires_at: Date };
type TransitionRow = {request_id:string; transition_id:string; to_state_code:C.RequestTransition["businessStatus"]; changed_at:Date; reason_code:string|null};
function requestDto(r:RequestRow, transitions:TransitionRow[]):C.StudentRequest {
  return C.StudentRequestSchema.parse({id:r.request_id,requestTypeCode:r.request_type_code,formSchemaVersion:r.form_schema_version,submittedData:r.submitted_data,submittedAt:r.submitted_at.toISOString(),localState:"STORED",businessStatus:r.business_status_code,externalState:r.external_state_code,...(r.rejection_reason?{statusInfo:r.rejection_reason}:{}),transitions:transitions.map(t=>({transitionId:t.transition_id,businessStatus:t.to_state_code,occurredAt:t.changed_at.toISOString(),...(t.reason_code?{reason:t.reason_code}:{})}))});
}
function appealDto(r:AppealRow):C.Appeal {
  return C.AppealSchema.parse({id:r.appeal_id,categoryCode:r.category_code,subject:r.subject,status:"OPEN",createdAt:r.created_at.toISOString(),externalState:r.external_state_code,...(r.last_message_at?{lastMessageAt:r.last_message_at.toISOString()}:{})});
}
export const requestTypes: C.RequestType[] = [
  { requestTypeCode: "DEMO_CERTIFICATE", kind: "CERTIFICATE", displayName: "Справка об обучении (демо)", formSchemaVersion: "v1", fields: [
    { name: "copies", label: "Количество экземпляров", kind: "INTEGER", required: true, minimum: 1, maximum: 5 },
    { name: "presentationPlace", label: "Место предъявления", kind: "TEXT", required: false, maxLength: 160 },
    { name: "comment", label: "Комментарий", kind: "LONG_TEXT", required: false, maxLength: 500 }] },
  { requestTypeCode: "DEMO_APPLICATION", kind: "APPLICATION", displayName: "Общее заявление (демо)", formSchemaVersion: "v1", fields: [
    { name: "subject", label: "Тема", kind: "TEXT", required: true, minLength: 3, maxLength: 120 },
    { name: "statementBody", label: "Текст заявления", kind: "LONG_TEXT", required: true, minLength: 10, maxLength: 3000 },
    { name: "comment", label: "Комментарий", kind: "LONG_TEXT", required: false, maxLength: 500 }] },
];
export class OperationsService {
  constructor(readonly auth: AuthContext) { assertAuthContext(auth); }
  meta() { return { requestId: this.auth.requestId, sourceStatus: "READY" as const }; }
  async types() {
    const available = await rows<{request_type_code: string}>(Prisma.sql`SELECT request_type_code FROM request_type_catalog WHERE is_available AND form_schema_version='v1'`);
    return requestTypes.filter(t=>available.some(r=>r.request_type_code===t.requestTypeCode));
  }
  async request(id:string):Promise<C.StudentRequest>{
    return transaction(database(),async tx=>{
      await run(Prisma.sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`,tx);
      const [r]=await rows<RequestRow>(Prisma.sql`SELECT r.*,t.request_type_code,o.external_state_code FROM student_request r JOIN request_type_catalog t USING(request_type_id) JOIN request_external_operation o USING(request_id) WHERE r.request_id::text=${id} AND r.owner_account_id=${this.auth.accountId}::uuid`,tx);
      if(!r)throw notFound();
      const transitions=await rows<TransitionRow>(Prisma.sql`SELECT * FROM request_state_transition WHERE request_id=${r.request_id}::uuid AND state_dimension_code='BUSINESS' ORDER BY changed_at,transition_id`,tx);
      return requestDto(r,transitions);
    });
  }
  async requests(kind?: "CERTIFICATE"|"APPLICATION") {
    // Один снимок списка и истории, без N+1 запросов и разрыва между статусом и переходами.
    return transaction(database(),async tx=>{
      await run(Prisma.sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`,tx);
      const records=await rows<RequestRow>(Prisma.sql`SELECT r.*,t.request_type_code,o.external_state_code FROM student_request r JOIN request_type_catalog t USING(request_type_id) JOIN request_external_operation o USING(request_id) WHERE r.owner_account_id=${this.auth.accountId}::uuid ${kind?Prisma.sql`AND t.request_kind_code=${kind}`:Prisma.empty} ORDER BY r.created_at DESC,r.request_id LIMIT 5001`,tx);
      if(records.length>5000)throw new AppError(503,"SOURCE_INCOMPLETE","История превышает доступный объём выборки.");
      if(!records.length)return [];
      const transitions=await rows<TransitionRow>(Prisma.sql`SELECT t.* FROM request_state_transition t JOIN student_request r USING(request_id) WHERE r.owner_account_id=${this.auth.accountId}::uuid AND t.request_id IN (${Prisma.join(records.map(r=>Prisma.sql`${r.request_id}::uuid`))}) AND t.state_dimension_code='BUSINESS' ORDER BY t.changed_at,t.transition_id`,tx);
      const grouped=new Map<string,TransitionRow[]>();for(const t of transitions){const group=grouped.get(t.request_id)??[];group.push(t);grouped.set(t.request_id,group);}
      return records.map(r=>requestDto(r,grouped.get(r.request_id)??[]));
    });
  }
  async appeal(id: string): Promise<C.Appeal> {
    const [r] = await rows<AppealRow>(Prisma.sql`SELECT a.*,o.external_state_code,(SELECT max(created_at) FROM appeal_message m WHERE m.appeal_id=a.appeal_id) AS last_message_at FROM student_appeal a JOIN appeal_external_operation o USING(appeal_id) WHERE a.appeal_id::text=${id} AND a.owner_account_id=${this.auth.accountId}::uuid`);
    if(!r) throw notFound();
    return C.AppealSchema.parse({ id:r.appeal_id,categoryCode:r.category_code,subject:r.subject,status:"OPEN",createdAt:r.created_at.toISOString(),externalState:r.external_state_code,...(r.last_message_at?{lastMessageAt:r.last_message_at.toISOString()}:{}) });
  }
  async appeals() {
    const records=await rows<AppealRow>(Prisma.sql`SELECT a.*,o.external_state_code,(SELECT max(m.created_at) FROM appeal_message m WHERE m.appeal_id=a.appeal_id) AS last_message_at FROM student_appeal a JOIN appeal_external_operation o USING(appeal_id) WHERE a.owner_account_id=${this.auth.accountId}::uuid ORDER BY a.updated_at DESC,a.appeal_id LIMIT 5001`);
    if(records.length>5000) throw new AppError(503,"SOURCE_INCOMPLETE","История превышает доступный объём выборки.");
    return records.map(appealDto);
  }
  async messages(id: string): Promise<C.Message[]> {
    await this.appeal(id);
    const messages=await rows<MessageRow>(Prisma.sql`SELECT m.*,CASE WHEN m.sender_kind_code='EXTERNAL_PARTY' THEN NULL WHEN m.sequence_number=1 THEN a.external_state_code ELSE d.delivery_state_code END AS delivery_state FROM appeal_message m JOIN student_appeal p USING(appeal_id) JOIN appeal_external_operation a USING(appeal_id) LEFT JOIN message_delivery_operation d USING(message_id) WHERE m.appeal_id::text=${id} AND p.owner_account_id=${this.auth.accountId}::uuid ORDER BY m.sequence_number,m.message_id LIMIT 5001`);
    if(messages.length>5000) throw new AppError(503,"SOURCE_INCOMPLETE","История превышает доступный объём выборки.");
    return messages.map(r=>C.MessageSchema.parse({messageId:r.message_id,appealId:r.appeal_id,sequenceNumber:Number(r.sequence_number),senderKind:r.sender_kind_code,senderLabel:r.sender_kind_code==="STUDENT"?"Вы":"Деканат (демо-ответ)",body:r.body,createdAt:r.created_at.toISOString(),...(r.source_created_at?{sourceCreatedAt:r.source_created_at.toISOString()}:{}),...(r.delivery_state?{deliveryState:r.delivery_state}:{})}));
  }
  page<T>(items:T[],filter:unknown,limit:number,cursor?:string) {
    const page=pageSlice(items,this.auth.accountId,filter,hash(JSON.stringify(items)).toString("hex"),limit,cursor);
    return {...page,isComplete:true,dataState:items.length?"READY" as const:"EMPTY_CONFIRMED" as const};
  }
  async detail(id:string) {
    const appeal=await this.appeal(id), all=await this.messages(id), page=this.page(all,{messages:id},20);
    return {appeal,recentMessages:page.items,messagesPage:{dataState:page.dataState,isComplete:page.isComplete,nextCursor:page.nextCursor}};
  }
  private async identity(tx:SqlClient) {
    const result=await rows<{source_code:string;external_student_id:string}>(Prisma.sql`SELECT i.source_code,i.external_student_id FROM student_external_identity i WHERE i.account_id=${this.auth.accountId}::uuid AND (i.valid_from IS NULL OR i.valid_from<=CURRENT_DATE) AND (i.valid_to IS NULL OR i.valid_to>=CURRENT_DATE)`,tx);
    if(result.length!==1) throw new AppError(503,"EXTERNAL_UNAVAILABLE","Не удалось подтвердить адресата передачи.");
    return result[0];
  }
  private async intention(scope:string,key:string,payload:unknown,create:(tx:SqlClient)=>Promise<{kind:Intent["result_kind"];id:string}>) {
    const digest=hash(key), payloadHash=hash(canonical(payload));
    const result=await transaction(database(),async tx=>{
      await lockAndRevalidateSession(tx, this.auth);
      const [old]=await rows<Intent>(Prisma.sql`SELECT request_hash,result_kind,result_id,expires_at FROM idempotency_record WHERE account_id=${this.auth.accountId}::uuid AND operation_scope_code=${scope} AND key_digest=${digest}`,tx);
      if(old) {
        if(old.expires_at.getTime()<=Date.now()) throw new AppError(409,"OPERATION_UNRESOLVED","Срок ключа отправки истёк. Проверьте историю.");
        if(!Buffer.from(old.request_hash).equals(payloadHash)) throw new AppError(409,"IDEMPOTENCY_CONFLICT","Эта отправка уже связана с другими данными.");
        return {id:old.result_id,kind:old.result_kind,replayed:true};
      }
      const [count]=await rows<{count:bigint}>(Prisma.sql`SELECT count(*) AS count FROM idempotency_record WHERE account_id=${this.auth.accountId}::uuid AND created_at>now()-interval '1 minute'`,tx);
      if(Number(count.count)>=10) throw new AppError(429,"RATE_LIMITED","Подождите перед следующей отправкой.",60);
      const result=await create(tx);
      await run(Prisma.sql`INSERT INTO idempotency_record(account_id,operation_scope_code,key_digest,request_hash,result_kind,result_id,expires_at) VALUES(${this.auth.accountId}::uuid,${scope},${digest},${payloadHash},${result.kind},${result.id},now()+interval '24 hours')`,tx);
      return {...result,replayed:false};
    });
    if(!result.replayed)await securityAudit(result.kind==="REQUEST"?"REQUEST_CREATED":result.kind==="APPEAL"?"APPEAL_CREATED":"MESSAGE_CREATED",{requestId:this.auth.requestId,accountId:this.auth.accountId,target:result.kind});
    return result;
  }
  async createRequest(input:C.CreateRequest,key:string) {
    const result=await this.intention("CREATE_REQUEST",key,input,async tx=>{
      const identity=await this.identity(tx);
      const [type]=await rows<{request_type_id:string}>(Prisma.sql`SELECT request_type_id FROM request_type_catalog WHERE request_type_code=${input.requestTypeCode} AND form_schema_version=${input.formSchemaVersion} AND is_available`,tx);
      if(!type) throw new AppError(409,"FORM_SCHEMA_CHANGED","Форма изменилась. Откройте её заново.");
      const id=randomUUID(),operation=randomUUID();
      await run(Prisma.sql`INSERT INTO student_request(request_id,owner_account_id,request_type_id,form_schema_version,submitted_data) VALUES(${id}::uuid,${this.auth.accountId}::uuid,${type.request_type_id}::uuid,${input.formSchemaVersion},${JSON.stringify(input.submittedData)}::jsonb)`,tx);
      await run(Prisma.sql`INSERT INTO request_external_operation(operation_id,request_id,source_code,operation_kind_code,correlation_id) VALUES(${operation}::uuid,${id}::uuid,${identity.source_code},'SUBMIT',${operation})`,tx);
      return {kind:"REQUEST",id};
    });
    return {...result,data:await this.request(result.id)};
  }
  async createAppeal(input:C.CreateAppeal,key:string) {
    if(!input.firstMessage.trim()||!input.subject.trim())throw new AppError(422,"VALIDATION_ERROR","Заполните тему и сообщение.");
    const result=await this.intention("CREATE_APPEAL",key,input,async tx=>{
      const identity=await this.identity(tx),id=randomUUID(),operation=randomUUID();
      await run(Prisma.sql`INSERT INTO student_appeal(appeal_id,owner_account_id,category_code,subject) VALUES(${id}::uuid,${this.auth.accountId}::uuid,${input.categoryCode},${input.subject})`,tx);
      await run(Prisma.sql`INSERT INTO appeal_message(appeal_id,sender_kind_code,sender_account_id,sequence_number,body) VALUES(${id}::uuid,'STUDENT',${this.auth.accountId}::uuid,1,${input.firstMessage})`,tx);
      await run(Prisma.sql`INSERT INTO appeal_external_operation(operation_id,appeal_id,source_code,operation_kind_code,correlation_id) VALUES(${operation}::uuid,${id}::uuid,${identity.source_code},'SUBMIT',${operation})`,tx);
      return {kind:"APPEAL",id};
    });
    return {...result,data:await this.detail(result.id)};
  }
  async sendMessage(appealId:string,input:C.NewMessage,key:string) {
    if(!input.body.trim())throw new AppError(422,"VALIDATION_ERROR","Сообщение не может состоять из пробелов.");
    const result=await this.intention("CREATE_APPEAL_MESSAGE",key,{appealId,...input},async tx=>{
      const [parent]=await rows<{source_code:string}>(Prisma.sql`SELECT o.source_code FROM student_appeal a JOIN appeal_external_operation o USING(appeal_id) WHERE a.appeal_id::text=${appealId} AND a.owner_account_id=${this.auth.accountId}::uuid FOR UPDATE OF a`,tx);
      if(!parent) throw notFound();
      const id=randomUUID();
      await run(Prisma.sql`INSERT INTO appeal_message(message_id,appeal_id,sender_kind_code,sender_account_id,sequence_number,body) SELECT ${id}::uuid,${appealId}::uuid,'STUDENT',${this.auth.accountId}::uuid,COALESCE(max(sequence_number),0)+1,${input.body} FROM appeal_message WHERE appeal_id=${appealId}::uuid`,tx);
      await run(Prisma.sql`INSERT INTO message_delivery_operation(message_id,source_code,remote_idempotency_key) VALUES(${id}::uuid,${parent.source_code},${id})`,tx);
      await run(Prisma.sql`UPDATE student_appeal SET updated_at=now() WHERE appeal_id=${appealId}::uuid`,tx);
      return {kind:"MESSAGE",id};
    });
    const data=(await this.messages(appealId)).find(m=>m.messageId===result.id);
    if(!data) throw notFound();
    return {...result,data};
  }
  async resolve(input:C.ResolveOperationRequest):Promise<C.ResolveOperationResult> {
    const [record]=await rows<Intent>(Prisma.sql`SELECT request_hash,result_kind,result_id,expires_at FROM idempotency_record WHERE account_id=${this.auth.accountId}::uuid AND operation_scope_code=${input.operationScope} AND key_digest=${hash(input.idempotencyKey.toLowerCase())}`);
    if(!record) return {state:"NOT_FOUND",operationScope:input.operationScope};
    if(record.expires_at.getTime()<=Date.now()) return {state:"EXPIRED",operationScope:input.operationScope};
    let target:C.Target;
    if(record.result_kind==="REQUEST") {await this.request(record.result_id);target={kind:"REQUEST",targetRef:record.result_id};}
    else if(record.result_kind==="APPEAL") {await this.appeal(record.result_id);target={kind:"APPEAL",targetRef:record.result_id};}
    else {const [r]=await rows<{appeal_id:string}>(Prisma.sql`SELECT m.appeal_id FROM appeal_message m JOIN student_appeal a USING(appeal_id) WHERE m.message_id::text=${record.result_id} AND a.owner_account_id=${this.auth.accountId}::uuid`);if(!r) throw notFound();target={kind:"APPEAL",targetRef:r.appeal_id};}
    return {state:"COMMITTED",operationScope:input.operationScope,target};
  }
}
