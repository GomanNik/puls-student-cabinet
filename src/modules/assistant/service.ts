import "server-only";
import type { AuthContext } from "@/modules/auth/context";
import type * as C from "@/shared/contracts/student-api";
import { CommunityService,calendarDay } from "@/modules/community/service";
import { OperationsService } from "@/modules/operations/service";
import { DemoAssistantProvider,GigaChatProvider,type AssistantFact } from "@/server/integrations/assistant-provider";
import { addDays,formatDay,formatTime } from "@/shared/lib/dates";
import { AppError } from "@/shared/server/errors";
import { withAssistantBudget } from "@/shared/server/service-budget";
import type { LearningService,LearningBinding } from "@/modules/learning/service";
import { securityAudit } from "@/shared/server/security-audit";
const mockNotice="Демонстрационный режим: ответ сформирован тестовым помощником по доступным данным. История диалога не сохраняется.";
const requestStatusLabels:Record<string,string>={SUBMITTED:"отправлена",IN_PROGRESS:"в работе",READY:"готово",REJECTED:"отклонена"};
async function* preferredBindings(learning:LearningService,periodId:string,question:string){
  const bindings:LearningBinding[]=[];for await(const binding of learning.bindings(periodId))bindings.push(binding);
  const words=question.match(/[а-яёa-z]{4,}/gu)??[];
  const score=(b:LearningBinding)=>words.filter(word=>b.title.toLocaleLowerCase("ru-RU").includes(word.slice(0,5))).length;
  const matched=bindings.filter(b=>score(b)>0).sort((a,b)=>score(b)-score(a));
  for(const binding of matched.length?matched:bindings)yield binding;
}
// Разговорные названия раскрываются до отбора разрешённых дисциплин, а не
// разрешают доступ к отсутствующей у студента дисциплине.
function normalizeQuestion(value:string){
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё","е")
    .replace(/(?<![а-я])(?:матеш[а-я]*|матан[а-я]*|математик[а-я]*)(?![а-я])/gu,"математический анализ")
    .replace(/(?<![а-я])(?:англ[а-я]*|инглиш|иняз[а-я]*)(?![а-я])/gu,"иностранный язык")
    .replace(/(?<![а-я])физр[а-я]*(?![а-я])/gu,"физическая культура")
    .replace(/(?<![а-я])пар(?:а|ы|у|е|ой|ам|ах|ами)(?![а-я])/gu,"занятие");
}
const date=(d:C.AcademicDate)=>d.on?`${formatDay(d.on)} (время не задано)`:`${formatDay(calendarDay(d))}, ${formatTime(d.at!,d.timeZone!)} (${d.timeZone})`;
export async function askAssistant(auth:AuthContext,input:C.AssistantQuestion):Promise<C.AssistantAnswer>{
  const message=input.message.normalize("NFC").trim();
  if(!message||Buffer.byteLength(message)>4096||Array.from(message).length>2000)throw new AppError(422,"VALIDATION_ERROR","Вопрос должен содержать не более 2000 символов и 4 КиБ.");
  return withAssistantBudget(auth,async()=>{
    const normalized=normalizeQuestion(message);
    const supported=/математ|иностран|истори|физическ|культурн|вчера|уведомл|объявлен|справк|заявк|заявлен|обращен|переписк|деканат|материал|скачать|конспект|срок|дедлайн|календар|событи|завтра|сегодня|расписан|заняти|подгрупп|балл|оцен|экзамен|зач[её]т|аттест|дисциплин|работ|уч[её]б|проект|лекци|семинар|лаборатор|посещ|проведен|состоял/.test(normalized);
    const unsupported=/(?:погод|гороскоп|рецепт|курс валют|биткоин|политик|столиц|президент)/.test(normalized);
    if(/(?:измени|поменяй|выставь|исправь оцен|отправь|подай|сдай|отметь прочитан|удали)/u.test(normalized)){await securityAudit("ASSISTANT_BLOCKED",{requestId:auth.requestId,accountId:auth.accountId,target:"ASSISTANT"});return {text:"Помощник не изменяет данные и не выполняет отправку. Заявку или сообщение можно отправить самостоятельно в соответствующем разделе. Официальные оценки, посещаемость и назначения студент не редактирует.",providerMode:"DEMO_MOCK",completeness:"COMPLETE",targets:[],notice:mockNotice};}
    if(/(?:составь|напиши|сформулируй).*(?:сообщен|обращен|деканат)/u.test(normalized))return {text:"Черновик для копирования:\n\nЗдравствуйте! Прошу уточнить информацию по моему вопросу: [кратко опишите ситуацию]. Подскажите, пожалуйста, порядок дальнейших действий и необходимые сведения. Спасибо!\n\nЗамените текст в квадратных скобках перед отправкой. Обращение не создано и не отправлено.",providerMode:"DEMO_MOCK",completeness:"COMPLETE",targets:[],notice:mockNotice};
    if(!supported||unsupported)return {text:"Эта тема не поддерживается помощником ПУЛЬС. Можно спросить о своих занятиях, работах, результатах, материалах, заявках, переписке, уведомлениях и календаре.",providerMode:"DEMO_MOCK",completeness:"UNKNOWN",targets:[],notice:mockNotice};
    const community=new CommunityService(auth),operations=new OperationsService(auth),facts:Array<AssistantFact&{target?:C.Target}>=[];let complete=true;
    const add=(text:string,target?:C.Target)=>{if(facts.length>=80){complete=false;return;}facts.push({id:`f${facts.length+1}`,text,...(target?{target}:{})});};
    let hint=input.contextHint??"GENERAL";
    if(hint==="GENERAL")hint=/уведомл|объявлен/.test(normalized)?"NOTIFICATIONS":/справк|заявк|заявлен/.test(normalized)?"REQUESTS":/обращен|переписк|деканат/.test(normalized)?"APPEALS":/срок|дедлайн/.test(normalized)?"DEADLINES":/материал|скачать|конспект/.test(normalized)?"MATERIALS":/календар|событи/.test(normalized)?"CALENDAR":/вчера|завтра|сегодня|расписан|заняти|посещ|проведен|состоял/.test(normalized)?"SCHEDULE":"STUDY";
    let requestedSubject:string|undefined;
    try{
      if(hint==="NOTIFICATIONS"){const feed=await community.notifications();complete&&=feed.complete;const unread=/непрочитан|новы/.test(normalized);const entries=feed.entries.filter(e=>!unread||!e.item.isRead);for(const {item} of entries)add(`Уведомление: ${item.title}. ${item.bodyPreview??""} ${item.isRead?"Прочитано.":"Не прочитано."}`,item.target);if(!entries.length&&complete)add(unread?"Непрочитанных уведомлений нет.":"В вашей ленте пока нет уведомлений.");}
      else if(hint==="REQUESTS"){const requests=await operations.requests();for(const r of requests)add(`Заявка: ${r.requestTypeCode==="DEMO_CERTIFICATE"?"Справка об обучении":"Общее заявление"}, сохранено ${formatDay(r.submittedAt.slice(0,10))}: ${requestStatusLabels[r.businessStatus??""]??"ожидает подтверждения передачи"}${r.statusInfo?`. ${r.statusInfo}`:""}.`,{kind:"REQUEST",targetRef:r.id});if(!requests.length)add("У вас пока нет сохранённых заявок.");}
      else if(hint==="APPEALS"){const appeals=await operations.appeals();for(const a of appeals.slice(0,20)){add(`Обращение «${a.subject}»: открыто.`,{kind:"APPEAL",targetRef:a.id});if(/ответ|сообщен/.test(normalized)){const replies=(await operations.messages(a.id)).filter(m=>m.senderKind==="EXTERNAL_PARTY");if(replies.length)add(`Последний демо-ответ по обращению «${a.subject}»: ${replies.at(-1)!.body}`,{kind:"APPEAL",targetRef:a.id});}}if(appeals.length>20)complete=false;if(!appeals.length)add("У вас пока нет сохранённых обращений.");}
      else{
        const learning=await community.learn(),today=learning.context.today;
        const subject=normalized.match(/(?:^|\s)по\s+([а-яё]{4,})/u)?.[1];
        if(subject&&!/^(моим|своим|учеб|работ|матер|срок|заяв|обращ|распис|уведом|дисципл|курсов)/u.test(subject)){
          requestedSubject=subject.slice(0,5);
          const current=learning.context.currentPeriod(),bindings:LearningBinding[]=[];
          if(current)for await(const b of learning.bindings(learning.context.periodId(current)))bindings.push(b);
          if(!bindings.some(b=>b.title.toLocaleLowerCase("ru-RU").includes(subject.slice(0,5))))return {text:"Указанная дисциплина не подтверждена в вашем доступном учебном контексте. Уточните название в разделе «Учёба».",providerMode:"DEMO_MOCK",completeness:"UNKNOWN",targets:[],notice:mockNotice};
        }
        if(hint==="SCHEDULE"){
          const from=/вчера/.test(normalized)?addDays(today,-1):/завтра/.test(normalized)?addDays(today,1):today,to=/недел/.test(normalized)?addDays(from,6):from;
          if(/посещ|присутств|пропуск|проведен|состоял/.test(normalized)){
            const period=learning.context.record.periods.find(p=>(!p.startsOn||p.startsOn<=from)&&(!p.endsOn||p.endsOn>=to));let found=false;
            if(!period)complete=false;
            else for await(const binding of preferredBindings(learning,learning.context.periodId(period),normalized)){
              if(binding.kind!=="OFFERING")continue;let cursor:string|undefined;
              do{const result=await learning.schedule.sessions(binding.publicPeriod,binding.publicContext,{from,to},100,cursor);complete&&=result.meta.completeness===true;
                for(const item of result.data.items){found=true;add(`${item.schedule.title}: проведение — ${item.actual?.held===true?"подтверждено":item.actual?.held===false?"не состоялось по данным источника":"не указано"}; посещаемость — ${item.attendance?.statusLabel??(item.attendanceState==="SOURCE_ERROR"?"источник недоступен":"сведения не указаны, это не подтверждённый пропуск")} .`,item.schedule.target);}
                cursor=result.data.nextCursor??undefined;
              }while(cursor);
            }
            complete&&=!learning.context.partial;
            if(!found&&complete)add("В выбранном диапазоне подтверждённых занятий нет. Факт посещения из этого не следует.");
          }else{
            let cursor:string|undefined;let found=false;
            do{const result=await learning.schedule.list({from,to},100,cursor);complete&&=result.meta.completeness===true;for(const s of result.data.items){found=true;add(`Занятие: ${s.title}: ${s.plannedStart&&s.timeZone?`${formatDay(calendarDay({precision:"DATE_TIME",at:s.plannedStart,timeZone:s.timeZone}))}, ${formatTime(s.plannedStart,s.timeZone)}`:"время не указано"}${s.room?`, ${s.room}`:""}${s.subgroupLabel?`, ${s.subgroupLabel}`:""}. ${s.status==="CANCELLED"?"Занятие отменено.":s.status==="RESCHEDULED"?"Время изменено.":""}`,s.target);}cursor=result.data.nextCursor??undefined;}while(cursor);
            if(!found&&complete)add(`С ${formatDay(from)} по ${formatDay(to)} подтверждённых занятий нет.`);
          }
        }
        else if(hint==="DEADLINES"||hint==="CALENDAR"){const result=await community.calendar({from:today,to:addDays(today,30),eventKinds:hint==="DEADLINES"?["ACADEMIC"]:["UNIVERSITY","ACADEMIC"]});complete&&=result.complete;for(const item of result.items)add(`${hint==="DEADLINES"?"Срок":"Событие календаря"}: ${item.title}: ${date(item.starts)}.`,item.target);if(!result.items.length&&complete)add("На ближайшие 30 дней подтверждённых событий выбранного вида нет.");}
        else if(hint==="MATERIALS"){const result=await learning.allMaterials({});complete&&=result.meta.completeness===true;for(const material of result.items){const binding=result.bindings.find(b=>b.publicContext===(material.offeringId??material.unitId));add(`Материал: ${binding?.title??""}: ${material.title}. ${material.kind==="FILE"?"Доступен файл.":"Доступна внешняя ссылка."}`,{kind:"MATERIAL",targetRef:material.materialId});}if(!result.items.length&&complete)add("Доступных учебных материалов пока нет.");}
        else{
          const current=learning.context.currentPeriod();if(!current){complete=false;add("Текущий учебный период не подтверждён источником.");}
          else for await(const binding of preferredBindings(learning,learning.context.periodId(current),normalized)){
            const target:C.Target={kind:binding.kind==="OFFERING"?"OFFERING":"UNIT",targetRef:binding.publicContext};
            if(binding.kind==="OFFERING"&&/подгрупп/.test(normalized)){const summary=await learning.schedule.summary(binding.period,binding.source.offeringId!);add(`${binding.title}: ${summary.subgroup.label?`официальная подгруппа ${summary.subgroup.label}`:"подгруппа не подтверждена"}.`,target);continue;}
            if(binding.kind==="OFFERING"&&/балл|оцен|экзамен|зачёт|зачет|аттест/.test(normalized)){
              const result=await learning.results(binding);complete&&=result.meta.completeness===true;
              add(`${binding.title}. Модель оценивания: ${result.data.gradingModelLabel??"не указана"}.`,target);
              for(const c of result.data.components)add(`Текущая оценка: ${binding.title}, ${c.label}: ${c.value?.rawValueText??c.value?.numeric??c.value?.text??c.value?.code??"значение не указано"}${c.maxValue?` из ${c.maxValue}`:""}.`,target);
              for(const a of result.data.attestations)add(`${binding.title}: ${a.kindLabel}, ${a.planned?date(a.planned):"дата не подтверждена"}.`,{kind:"ATTESTATION",targetRef:a.attestationId});
              const official=result.data.officialResult;add(`${binding.title}: официальный результат (оценка) — ${official?.value?.rawValueText??official?.value?.numeric??official?.value?.text??official?.value?.code??"результат пока не указан"}.`,target);
            }else{
              let cursor:string|undefined;do{const works=await learning.listWorks(binding,100,cursor);complete&&=works.meta.completeness===true;for(const w of works.data.items)add(`${binding.title}: ${w.title}${w.due?`. Срок: ${date(w.due)}`:". Срок не указан"}. Выполнение: ${w.progress.completionStatusCode??"не указано"}; проверка: ${w.progress.reviewStatusCode??"не указана"}.`,w.target);cursor=works.data.nextCursor??undefined;}while(cursor);
            }
          }
        }
        complete&&=!learning.context.partial;
      }
    }catch{complete=false;}
    // В LLM отправляются только тексты разрешённых фактов, без внутренних
    // аккаунтов, source IDs, ссылок, полных профилей и сырых read-model.
    const selectedFacts:typeof facts=[];let bytes=Buffer.byteLength(message);
    for(const fact of facts){if(requestedSubject&&!fact.text.toLocaleLowerCase("ru-RU").includes(requestedSubject))continue;const n=Buffer.byteLength(fact.text);if(bytes+n>12000){complete=false;break;}selectedFacts.push(fact);bytes+=n;}
    const fixtureMode=process.env.PULS_AI_FIXTURE_SCENARIO??"normal";
    if(!["normal","partial","no-data","error","timeout"].includes(fixtureMode))throw new AppError(503,"EXTERNAL_UNAVAILABLE","Некорректная конфигурация помощника.");
    if(fixtureMode==="partial"){selectedFacts.splice(1);complete=false;}
    const selectionQuestion=hint==="SCHEDULE"&&/вчера|завтра|сегодня|недел/.test(normalized)&&!/посещ|проведен|состоял/.test(normalized)?`${normalized} занятие`:`${normalized} ${hint==="MATERIALS"?"материал":hint==="DEADLINES"?"срок":hint==="NOTIFICATIONS"?"уведомление":hint==="REQUESTS"?"заявка":hint==="APPEALS"?"обращение":/балл|оцен/.test(normalized)?"оценка":""}`;
    let providerMode:C.AssistantAnswer["providerMode"]="DEMO_MOCK",notice=mockNotice,ids:string[];
    if(fixtureMode==="error"||fixtureMode==="timeout"){ids=[];complete=false;notice="Демонстрационный источник ИИ временно недоступен. Подтверждённый ответ получить не удалось.";}
    else if(fixtureMode==="no-data"){ids=[];}
    else if(process.env.PULS_AI_PROVIDER==="GIGACHAT"){
      try{ids=await new GigaChatProvider().select(normalized,selectedFacts.map(({id,text})=>({id,text})));providerMode="GIGACHAT";notice="GigaChat выбрал релевантные сведения. Ответ составлен из подтверждённых сервером фактов; история не сохраняется.";}
      catch{ids=await new DemoAssistantProvider().select(selectionQuestion,selectedFacts);notice="GigaChat недоступен. Включён явно обозначенный демонстрационный помощник. История не сохраняется.";}
    }else ids=await new DemoAssistantProvider().select(selectionQuestion,selectedFacts);
    const chosen=ids.map(id=>selectedFacts.find(f=>f.id===id)).filter((f):f is typeof facts[number]=>!!f);
    const targets=[...new Map(chosen.filter(f=>f.target).map(f=>[JSON.stringify(f.target),f.target!])).values()].slice(0,10);
    const text=chosen.length?chosen.map(f=>`• ${f.text}`).join("\n"):complete?"По вопросу не найдены подходящие подтверждённые сведения. Уточните дисциплину или раздел.":"Не удалось получить достаточные сведения. Попробуйте позже или откройте нужный раздел.";
    return {text:`${text}${complete?"":"\n\nЧасть сведений недоступна или не вошла в ограниченный контекст. Ответ не является полной сводкой."}`,providerMode,completeness:complete?"COMPLETE":chosen.length?"PARTIAL":"UNKNOWN",targets,notice};
  });
}
