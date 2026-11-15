import "server-only";
import { createHash } from "node:crypto";
import * as S from "./contracts";
import { AppError } from "@/shared/server/errors";
const source = "UNIVERSITY_FIXTURE";
const external = (kind:string,id:string) => `${kind}-${createHash("sha256").update(id).digest("hex").slice(0,32)}`;
// Детерминированный серверный test-adapter. Точка начала сценария закреплена
// в долговечной operation, поэтому перезапуск runner не создаёт новый ответ.
// Состояния вычисляет источник, а не браузер или сервис заявок.
export class AdministrationFixture {
  // В in-process источнике состояние воспроизводится по неизменной команде
  // и закреплённому времени приёма. Опрос не создаёт новую удалённую операцию.
  requestStatus(command:S.RequestSubmitCommand,acceptedAt:Date){return this.request(command,acceptedAt);}
  appealStatus(command:S.AppealSubmitCommand,acceptedAt:Date){return this.appeal(command,acceptedAt);}
  messageStatus(command:S.MessageSubmitCommand,acceptedAt:Date){return this.message(command,acceptedAt);}
  private available(sourceCode:string,student:string) {
    if(sourceCode!==source || !["fixture-student-a","fixture-student-b"].includes(student)) throw new AppError(502,"EXTERNAL_INVALID_RESPONSE","Тестовый источник не подтвердил получателя.");
    if(!["normal","unavailable","timeout","timeout-after-accept","rejected","duplicate-reply","stale-status","same-status-revision"].includes(process.env.PULS_ADMIN_FIXTURE_SCENARIO??"normal"))throw new AppError(503,"EXTERNAL_UNAVAILABLE","Некорректная конфигурация административного источника.");
    if(process.env.PULS_ADMIN_FIXTURE_SCENARIO==="timeout")throw new AppError(504,"EXTERNAL_TIMEOUT","Тестовый источник не ответил вовремя.");
    if(process.env.PULS_ADMIN_FIXTURE_SCENARIO==="unavailable") throw new AppError(503,"EXTERNAL_UNAVAILABLE","Тестовый источник недоступен.");
  }
  request(command:S.RequestSubmitCommand,acceptedAt:Date,now=new Date()) {
    const c=S.RequestSubmitCommandSchema.parse(command);this.available(c.sourceCode,c.externalStudentId);
    const elapsed=process.env.PULS_ADMIN_FIXTURE_SCENARIO==="stale-status" && Math.floor((now.getTime()-acceptedAt.getTime())/15_000)%2===1?0:now.getTime()-acceptedAt.getTime(), rejected=process.env.PULS_ADMIN_FIXTURE_SCENARIO==="rejected";
    if(process.env.PULS_ADMIN_FIXTURE_SCENARIO==="timeout-after-accept"&&elapsed<1000)throw new AppError(504,"EXTERNAL_TIMEOUT","Ответ тестового источника не подтверждён.");
    const transitions:S.RequestBusinessTransition[]=[{eventOccurrenceKey:external("submitted",c.operationId),businessStatus:"SUBMITTED",occurredAt:acceptedAt.toISOString(),sourceRevision:"1"}];
    if(elapsed>=30_000) transitions.push({eventOccurrenceKey:external("processing",c.operationId),businessStatus:"IN_PROGRESS",occurredAt:new Date(+acceptedAt+30_000).toISOString(),sourceRevision:"2"});
    if(elapsed>=90_000) transitions.push({eventOccurrenceKey:external("finished",c.operationId),businessStatus:rejected?"REJECTED":"READY",occurredAt:new Date(+acceptedAt+90_000).toISOString(),sourceRevision:"3",...(rejected?{reason:"Демонстрационный отказ тестового источника. Юридических последствий нет."}:{})});
    const metadataOnly=process.env.PULS_ADMIN_FIXTURE_SCENARIO==="same-status-revision";
    const revisionStep=Math.max(0,Math.floor(elapsed/15_000));
    return S.RequestOperationStatusSchema.parse({sourceCode:source,operationId:c.operationId,correlationId:c.correlationId,externalOperationId:external("request",c.operationId),transportState:"ACKNOWLEDGED",alreadyProcessed:elapsed>1000,businessStatus:transitions.at(-1)!.businessStatus,transitions,sourceRevision:metadataOnly?`snapshot-${revisionStep}`:String(transitions.length),sourceUpdatedAt:metadataOnly?new Date(+acceptedAt+revisionStep*15_000).toISOString():transitions.at(-1)!.occurredAt});
  }
  appeal(command:S.AppealSubmitCommand,acceptedAt:Date) {
    const c=S.AppealSubmitCommandSchema.parse(command);this.available(c.sourceCode,c.externalStudentId);
    if(process.env.PULS_ADMIN_FIXTURE_SCENARIO==="timeout-after-accept"&&Date.now()-+acceptedAt<1000)throw new AppError(504,"EXTERNAL_TIMEOUT","Ответ тестового источника не подтверждён.");
    return S.AppealOperationStatusSchema.parse({sourceCode:source,operationId:c.operationId,correlationId:c.correlationId,externalAppealId:external("appeal",c.operationId),transportState:"ACKNOWLEDGED",appealStatus:"OPEN",alreadyProcessed:Date.now()-+acceptedAt>1000,sourceRevision:"1",sourceUpdatedAt:acceptedAt.toISOString()});
  }
  message(command:S.MessageSubmitCommand,acceptedAt=new Date(),now=new Date()) {
    const c=S.MessageSubmitCommandSchema.parse(command);this.available(c.sourceCode,c.externalStudentId);
    if(process.env.PULS_ADMIN_FIXTURE_SCENARIO==="timeout-after-accept"&&+now-+acceptedAt<1000)throw new AppError(504,"EXTERNAL_TIMEOUT","Ответ тестового источника не подтверждён.");
    return S.MessageOperationStatusSchema.parse({sourceCode:source,messageId:c.messageId,externalAppealId:c.externalAppealId,transportState:"ACKNOWLEDGED",externalMessageId:external("message",c.messageId),alreadyProcessed:+now-+acceptedAt>=1000,sourceRevision:"1"});
  }
  replies(sourceCode:string,student:string,externalAppealId:string,delivered: {messageId:string;acceptedAt:Date}[],now=new Date()):S.Reply[] {
    this.available(sourceCode,student);
    const replies=delivered.filter(m=>+now-+m.acceptedAt>=30_000).map(m=>{
      const id=external("reply",m.messageId);
      return S.ReplySchema.parse({ref:{sourceCode:source,objectKind:"APPEAL_MESSAGE",externalId:id},externalMessageId:id,externalAppealId,body:"Деканат (демо-ответ): ваше сообщение получено тестовым источником. В конкурсном прототипе реальные сотрудники вуза не участвуют. Переписку можно продолжить здесь.",sourceCreatedAt:new Date(+m.acceptedAt+30_000).toISOString(),senderKind:"EXTERNAL_PARTY",senderLabel:"Деканат (демо-ответ)",eventOccurrenceKey:id});
    });
    return process.env.PULS_ADMIN_FIXTURE_SCENARIO==="duplicate-reply"?replies.flatMap(r=>[r,r]):replies;
  }
}
