import { describe,expect,it } from "vitest";
import { advanceRequest } from "@/modules/operations/request-state";
import { DemoAssistantProvider } from "@/server/integrations/assistant-provider";
import { RequestTypeSchema } from "@/shared/contracts/student-api";
import { requestTypes } from "@/modules/operations/service";

const time=(n:number)=>new Date(Date.UTC(2026,10,13,10,n));
const change=(status:"SUBMITTED"|"IN_PROGRESS"|"READY"|"REJECTED",n:number,key=status)=>({businessStatus:status,eventOccurrenceKey:key,occurredAt:time(n).toISOString(),sourceRevision:`opaque-${10-n}`});
describe("регрессии двух аудитов — выполнение только на этапе Б",()=>{
  it("не откатывает terminal и непрозрачную revision старым ответом",()=>{
    const known=[{event_occurrence_key:"READY",to_state_code:"READY",changed_at:time(3)}];
    expect(advanceRequest("READY",known,[change("SUBMITTED",0)],time(0),time(3))).toMatchObject({status:"READY",advanced:false,changes:[]});
    expect(advanceRequest("READY",known,[change("REJECTED",4)],time(4),time(3)).advanced).toBe(false);
  });
  it("принимает достоверную цепочку один раз, не сравнивая строки revision",()=>{
    const transitions=[change("SUBMITTED",0),change("IN_PROGRESS",1),change("READY",2)];
    const result=advanceRequest(null,[],transitions,time(2),null);
    expect(result.status).toBe("READY");expect(result.changes.map(c=>c.from)).toEqual([null,"SUBMITTED","IN_PROGRESS"]);
    const known=transitions.map(c=>({event_occurrence_key:c.eventOccurrenceKey,to_state_code:c.businessStatus,changed_at:new Date(c.occurredAt)}));
    expect(advanceRequest("READY",known,transitions,time(2),time(2)).changes).toEqual([]);
  });
  it.each(requestTypes)("каталог $requestTypeCode требует все уникальные дескрипторы",type=>{
    expect(RequestTypeSchema.safeParse(type).success).toBe(true);
    expect(RequestTypeSchema.safeParse({...type,fields:[type.fields[0],type.fields[0],type.fields[0]]}).success).toBe(false);
  });
  it("демо-ИИ не подставляет случайный факт при нулевом совпадении",async()=>{
    const provider=new DemoAssistantProvider(),facts=[{id:"f1",text:"Математика: лабораторная работа. Срок 14 ноября."}];
    expect(await provider.select("Какая погода?",facts)).toEqual([]);
    expect(await provider.select("Лабораторная работа",facts)).toEqual(["f1"]);
  });
});
