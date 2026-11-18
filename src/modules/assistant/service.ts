import "server-only";
import type { AuthContext } from "@/modules/auth/context";
import type * as C from "@/shared/contracts/student-api";
import { CommunityService,calendarDay } from "@/modules/community/service";
import { OperationsService } from "@/modules/operations/service";
import { DemoAssistantProvider,GigaChatProvider,GigaChatError,type AssistantFact } from "@/server/integrations/assistant-provider";
import { addDays,formatDay,formatTime } from "@/shared/lib/dates";
import { AppError } from "@/shared/server/errors";
import { consumeAccountBudget, withAssistantBudget } from "@/shared/server/service-budget";
import type { LearningService,LearningBinding } from "@/modules/learning/service";
import { securityAudit } from "@/shared/server/security-audit";
const mockNotice="Демонстрационный режим: ответ сформирован тестовым помощником по доступным данным.";
const searchNotice="Академический поиск: совпадения отобраны по разрешённым учебным данным текущего студента.";
const requestStatusLabels:Record<string,string>={SUBMITTED:"отправлена",IN_PROGRESS:"в работе",READY:"готово",REJECTED:"отклонена"};
function providerError(error:unknown):AppError{
  if(error instanceof GigaChatError){
    if(error.kind==="AUTH")return new AppError(503,"EXTERNAL_UNAVAILABLE","Не удалось авторизовать GigaChat. Сообщите администратору сервиса.");
    if(error.kind==="RATE_LIMIT")return new AppError(429,"RATE_LIMITED","GigaChat временно ограничил запросы. Повторите позже.");
    if(error.kind==="TIMEOUT")return new AppError(504,"EXTERNAL_TIMEOUT","GigaChat не ответил вовремя. Повторите запрос.");
    if(error.kind==="CONTEXT")return new AppError(422,"VALIDATION_ERROR","Контекст диалога слишком велик. Очистите чат или сократите вопрос.");
    if(error.kind==="MODEL")return new AppError(503,"EXTERNAL_UNAVAILABLE","Выбранная модель GigaChat сейчас недоступна.");
    if(error.kind==="INVALID_RESPONSE")return new AppError(502,"EXTERNAL_INVALID_RESPONSE","GigaChat вернул некорректный ответ. Повторите запрос позже.");
  }
  return new AppError(503,"EXTERNAL_UNAVAILABLE","Не удалось получить ответ GigaChat. Повторите запрос позже.");
}
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
    .replace(/(?<![а-я])пар(?:а|ы|у|е|ой|ам|ах|ами)?(?![а-я])/gu,"занятие");
}
function academicSearchQuery(value:string):string|null{
  const raw=value.normalize("NFC").trim();
  const explicit=/^(?:пожалуйста[\s,]+)?(?:найди|найти|поищи|поищите|поиск|покажи|показать|открой|открыть)\b/iu.test(raw);
  const academic=/(?:дисциплин|предмет|курс|работ|задан|курсов|лаборатор|практическ|семинар|математ|матанализ|истори|иностранн|английск|иняз|физическ|физкультур|численн)/iu.test(raw);
  const materialIntent=/(?:материал|файл|лекци|конспект)/iu.test(raw)&&!/(?:работ|дисциплин|предмет|задан|курсов)/iu.test(raw);
  const question=/^(?:что|как|сколько|когда|какой|какая|какие|где|почему|зачем|у меня|мне|подскажи|объясни|расскажи)\b/iu.test(raw)||raw.includes("?");
  if(!academic||materialIntent||(!explicit&&question))return null;
  let query=raw
    .replace(/^(?:пожалуйста[\s,]+)?(?:найди|найти|поищи|поищите|поиск|покажи|показать|открой|открыть)\s*/iu,"")
    .replace(/^(?:мне\s+)?(?:дисциплину|дисциплины|предмет|предметы|курс|курсы)\s*(?:по|для)?\s*/iu,"")
    .replace(/^по\s+уч[её]б[еы]\s*[:,-]?\s*/iu,"")
    .replace(/^(?:по|для)\s+/iu,"")
    .replace(/[?!.]+$/u,"")
    .replace(/^[«„"'`]+|[»“"'`]+$/gu,"")
    .trim()
    .replace(/английск[а-я]*/iu,"иностранный язык")
    .replace(/матанализ[а-я]*/iu,"математический анализ")
    .replace(/физкультур[а-я]*/iu,"физическая культура");
  const lower=query.toLocaleLowerCase("ru-RU").replaceAll("ё","е");
  if(/^(?:матанализ[а-я]*|математик[а-я]*)$/u.test(lower)||/^математическ(?:ому|ого|ом|ую|ой|ая|ие|их)?\s+анализ(?:у|а|ом)?$/u.test(lower))query="математический анализ";
  else if(/^истори(?:и|ю|ей)\s+россии$/u.test(lower))query="история россии";
  else if(/^(?:английск(?:ому|ого|ий|ом|ую|ой|ие|их)?|иностранн(?:ому|ого|ый|ом|ую|ой|ые)?)\s+язык(?:у|а|ом|и)?$/u.test(lower))query="иностранный язык";
  else if(/^(?:физкультур[а-я]*|физическ(?:ой|ую|ая|ого|ому|ом)?\s+культур(?:е|у|ы|ой)?)$/u.test(lower))query="физическая культура";
  return query.length>=2&&query.length<=120?query:null;
}
const date=(d:C.AcademicDate)=>d.on?`${formatDay(d.on)} (время не задано)`:`${formatDay(calendarDay(d))}, ${formatTime(d.at!,d.timeZone!)} (${d.timeZone})`;
export async function askAssistant(auth:AuthContext,input:C.AssistantQuestion):Promise<C.AssistantAnswer>{
  const message=input.message.normalize("NFC").trim();
  if(!message||Buffer.byteLength(message)>4096||Array.from(message).length>2000)throw new AppError(422,"VALIDATION_ERROR","Вопрос должен содержать не более 2000 символов и 4 КиБ.");
  const history=input.history??[];
  if(Buffer.byteLength(JSON.stringify(history))>8192)throw new AppError(422,"VALIDATION_ERROR","Контекст диалога слишком велик. Очистите чат или сократите вопрос.");
  return withAssistantBudget(auth,async()=>{
    const normalized=normalizeQuestion(message);
    const supported=/математ|иностран|истори|физическ|культурн|вчера|уведомл|объявлен|справк|заявк|заявлен|обращен|переписк|деканат|материал|файл|скачать|конспект|срок|дедлайн|календар|событи|завтра|сегодня|расписан|заняти|подгрупп|балл|оцен|экзамен|зач[её]т|аттест|дисциплин|работ|уч[её]б|проект|лекци|семинар|лаборатор|посещ|проведен|состоял/.test(normalized);
    const unsupported=/(?:погод|гороскоп|рецепт|курс валют|биткоин|политик|столиц|президент)/.test(normalized);
    if(/(?:измени|поменяй|выставь|исправь оцен|отправь|подай|сдай|отметь прочитан|удали)/u.test(normalized)){await securityAudit("ASSISTANT_BLOCKED",{requestId:auth.requestId,accountId:auth.accountId,target:"ASSISTANT"});return {text:"Помощник не изменяет данные и не выполняет отправку. Заявку или сообщение можно отправить самостоятельно в соответствующем разделе. Официальные оценки, посещаемость и назначения студент не редактирует.",providerMode:"DEMO_MOCK",completeness:"COMPLETE",targets:[],notice:mockNotice};}
    if(/(?:составь|напиши|сформулируй).*(?:сообщен|обращен|деканат)/u.test(normalized))return {text:"Черновик для копирования:\n\nЗдравствуйте! Прошу уточнить информацию по моему вопросу: [кратко опишите ситуацию]. Подскажите, пожалуйста, порядок дальнейших действий и необходимые сведения. Спасибо!\n\nЗамените текст в квадратных скобках перед отправкой. Обращение не создано и не отправлено.",providerMode:"DEMO_MOCK",completeness:"COMPLETE",targets:[],notice:mockNotice};
    const searchQuery=academicSearchQuery(message);
    if(searchQuery){
      await consumeAccountBudget(auth,"SEARCH");
      const learning=await new CommunityService(auth).learn();
      const result=await learning.search(searchQuery,10);
      const items=result.data.items;
      const countWord=items.length%10===1&&items.length%100!==11?"совпадение":items.length%10>=2&&items.length%10<=4&&(items.length%100<12||items.length%100>14)?"совпадения":"совпадений";
      const text=items.length
        ? `Нашёл ${items.length}${result.data.hasMore?" первых":""} ${countWord} по запросу «${searchQuery}»:\n\n${items.map((item,index)=>`${index+1}. ${item.title} — ${item.kind==="OFFERING"?"дисциплина":"учебная работа"}${item.disciplineLabel?` · ${item.disciplineLabel}`:""} · ${item.periodLabel}`).join("\n")}`
        : result.data.completeness==="COMPLETE"
          ? `По запросу «${searchQuery}» совпадений не найдено. Попробуйте другое название или уточните формулировку.`
          : `Не удалось подтвердить полный результат поиска по запросу «${searchQuery}»: часть учебных данных сейчас недоступна. Попробуйте позже.`;
      return {text,providerMode:"DEMO_MOCK",completeness:result.data.completeness==="COMPLETE"?"COMPLETE":items.length?"PARTIAL":"UNKNOWN",targets:items.map(item=>({kind:item.kind,targetRef:item.targetRef})),notice:searchNotice};
    }
    if(!supported||unsupported){
      if(process.env.PULS_AI_PROVIDER==="GIGACHAT"&&!unsupported){
        try{const generated=await new GigaChatProvider().answer(message,[],history);return {text:generated.text,providerMode:"GIGACHAT",completeness:"UNKNOWN",targets:[],notice:"Ответ GigaChat на общий вопрос; официальные учебные сведения здесь не использовались."};}
        catch(error){throw providerError(error);}
      }
      return {text:"Эта тема не поддерживается помощником ПУЛЬС. Можно спросить о своих занятиях, работах, результатах, материалах, заявках, переписке, уведомлениях и календаре.",providerMode:"DEMO_MOCK",completeness:"UNKNOWN",targets:[],notice:mockNotice};
    }
    const community=new CommunityService(auth),operations=new OperationsService(auth),facts:Array<AssistantFact&{target?:C.Target}>=[];let complete=true;
    const add=(text:string,target?:C.Target)=>{if(facts.length>=80){complete=false;return;}facts.push({id:`f${facts.length+1}`,text,...(target?{target}:{})});};
    let hint=input.contextHint??"GENERAL";
    if(hint==="GENERAL")hint=/уведомл|объявлен/.test(normalized)?"NOTIFICATIONS":/справк|заявк|заявлен/.test(normalized)?"REQUESTS":/обращен|переписк|деканат/.test(normalized)?"APPEALS":/срок|дедлайн/.test(normalized)?"DEADLINES":/материал|скачать|конспект|лекци|файл/.test(normalized)?"MATERIALS":/календар|событи/.test(normalized)?"CALENDAR":/вчера|завтра|сегодня|следующ.*заняти|расписан|заняти|посещ|проведен|состоял/.test(normalized)?"SCHEDULE":"STUDY";
    let requestedSubject:string|undefined;
    try{
      if(hint==="NOTIFICATIONS"){const feed=await community.notifications();complete&&=feed.complete;const unread=/непрочитан|новы/.test(normalized);const entries=feed.entries.filter(e=>!unread||!e.item.isRead);for(const {item} of entries)add(`Уведомление: ${item.title}. ${item.bodyPreview??""} ${item.isRead?"Прочитано.":"Не прочитано."}`,item.target);if(!entries.length&&complete)add(unread?"Непрочитанных уведомлений нет.":"В вашей ленте пока нет уведомлений.");}
      else if(hint==="REQUESTS"){
        const asksForms=/как|какие|какой|вид|тип|форм|заказ|оформ|получ|доступн/.test(normalized)&&!/статус|готов|отправлен/.test(normalized);
        if(asksForms){const types=await operations.types();for(const type of types)add(`Доступная демонстрационная форма: ${type.displayName}. Откройте раздел заявлений и справок для заполнения.`,{kind:"REQUEST",targetRef:"new"});if(!types.length)add("Сейчас нет доступных демонстрационных форм заявлений и справок.");}
        if(!asksForms||/мо[ия]|статус|готов|отправлен/.test(normalized)){
          const requests=await operations.requests();for(const r of requests.slice(0,20))add(`Заявка: ${r.requestTypeCode==="DEMO_CERTIFICATE"?"Справка об обучении":"Общее заявление"}, сохранено ${formatDay(r.submittedAt.slice(0,10))}: ${requestStatusLabels[r.businessStatus??""]??"ожидает подтверждения передачи"}${r.statusInfo?`. ${r.statusInfo}`:""}.`,{kind:"REQUEST",targetRef:r.id});
          if(requests.length>20)complete=false;if(!requests.length)add("У вас пока нет сохранённых заявок.");
        }
      }
      else if(hint==="APPEALS"){
        const appeals=await operations.appeals(), includeReplies=/ответ|сообщен|переписк|что с|деканат|последн/.test(normalized);
        for(const [index,a] of appeals.slice(0,20).entries()){
          add(`Обращение «${a.subject}»: открыто.`,{kind:"APPEAL",targetRef:a.id});
          if(includeReplies&&index<3){const replies=(await operations.messages(a.id)).filter(m=>m.senderKind==="EXTERNAL_PARTY");if(replies.length)add(`Последний демо-ответ по обращению «${a.subject}»: ${replies.at(-1)!.body}`,{kind:"APPEAL",targetRef:a.id});}
        }
        if(appeals.length>20||includeReplies&&appeals.length>3)complete=false;
        if(!appeals.length)add("У вас пока нет сохранённых обращений.");
      }
      else{
        const learning=await community.learn(),today=learning.context.today;
        const subject=normalized.match(/(?:^|\s)по\s+(?:(?:моей|моему|дисциплине)\s+)?([а-яё]{4,})/u)?.[1];
        if(subject&&!/^(моим|своим|учеб|работ|матер|срок|заяв|обращ|распис|уведом|дисципл|курсов)/u.test(subject)){
          requestedSubject=subject.slice(0,5);
          const current=learning.context.currentPeriod(),bindings:LearningBinding[]=[];
          if(current)for await(const b of learning.bindings(learning.context.periodId(current)))bindings.push(b);
          if(!bindings.some(b=>b.title.toLocaleLowerCase("ru-RU").includes(subject.slice(0,5))))return {text:"Указанная дисциплина не подтверждена в вашем доступном учебном контексте. Уточните название в разделе «Учёба».",providerMode:"DEMO_MOCK",completeness:"UNKNOWN",targets:[],notice:mockNotice};
        }
        if(hint==="SCHEDULE"){
          const from=/вчера/.test(normalized)?addDays(today,-1):/завтра/.test(normalized)?addDays(today,1):today,to=/недел/.test(normalized)?addDays(from,6):/следующ/.test(normalized)?addDays(from,14):from;
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
            let cursor:string|undefined;let found=false;const scheduled:C.ScheduleEntry[]=[];
            do{const result=await learning.schedule.list({from,to},100,cursor);complete&&=result.meta.completeness===true;for(const s of result.data.items){found=true;scheduled.push(s);add(`Занятие: ${s.title}: ${s.plannedStart&&s.timeZone?`${formatDay(calendarDay({precision:"DATE_TIME",at:s.plannedStart,timeZone:s.timeZone}))}, ${formatTime(s.plannedStart,s.timeZone)}`:"время не указано"}${s.room?`, ${s.room}`:""}${s.subgroupLabel?`, ${s.subgroupLabel}`:""}. ${s.status==="CANCELLED"?"Занятие отменено.":s.status==="RESCHEDULED"?"Время изменено.":""}`,s.target);}cursor=result.data.nextCursor??undefined;}while(cursor);
            if(/сколько/.test(normalized)&&/заняти/.test(normalized)){
              const available=scheduled.filter(s=>s.status!=="CANCELLED");
              return {text:`На ${formatDay(from)}: ${available.length} ${available.length===1?"занятие":available.length>=2&&available.length<=4?"занятия":"занятий"}${complete?".":" по доступной части расписания; полный состав не подтверждён."}`,providerMode:"DEMO_MOCK",completeness:complete?"COMPLETE":"PARTIAL",targets:available.slice(0,10).map(s=>s.target),notice:mockNotice};
            }
            if(/следующ/.test(normalized)&&/заняти/.test(normalized)){
              const next=scheduled.filter(s=>s.status!=="CANCELLED"&&s.plannedStart&&s.timeZone&&Date.parse(s.plannedStart)>Date.now()).sort((a,b)=>Date.parse(a.plannedStart!)-Date.parse(b.plannedStart!))[0];
              if(scheduled.some(s=>s.status!=="CANCELLED"&&s.plannedStart&&!s.timeZone))complete=false;
              if(next)return {text:`Следующее подтверждённое занятие: ${next.title}, ${formatDay(calendarDay({precision:"DATE_TIME",at:next.plannedStart!,timeZone:next.timeZone!}))}, ${formatTime(next.plannedStart!,next.timeZone!)}${next.room?`, ${next.room}`:""}.`,providerMode:"DEMO_MOCK",completeness:complete?"COMPLETE":"PARTIAL",targets:[next.target],notice:mockNotice};
              if(complete)return {text:"На ближайшие 14 дней следующего подтверждённого занятия не найдено.",providerMode:"DEMO_MOCK",completeness:"COMPLETE",targets:[],notice:mockNotice};
            }
            if(!found&&complete)add(`С ${formatDay(from)} по ${formatDay(to)} подтверждённых занятий нет.`);
          }
        }
        else if(hint==="DEADLINES"||hint==="CALENDAR"){const days=/горят|срочн|ближайш/.test(normalized)?7:30;const result=await community.calendar({from:today,to:addDays(today,days),eventKinds:hint==="DEADLINES"?["ACADEMIC"]:["UNIVERSITY","ACADEMIC"]});complete&&=result.complete;for(const item of result.items)add(`${hint==="DEADLINES"?"Срок":"Событие календаря"}: ${item.title}: ${date(item.starts)}.`,item.target);if(!result.items.length&&complete)add(`На ближайшие ${days} дней подтверждённых событий выбранного вида нет.`);}
        else if(hint==="MATERIALS"){const result=await learning.allMaterials({});complete&&=result.meta.completeness===true;let matched=0;for(const material of result.items){const binding=result.bindings.find(b=>b.publicContext===(material.offeringId??material.unitId));if(requestedSubject&&!binding?.title.toLocaleLowerCase("ru-RU").includes(requestedSubject))continue;matched++;add(`Материал: ${binding?.title??""}: ${material.title}. ${material.kind==="FILE"?"Доступен файл.":"Доступна внешняя ссылка."}`,{kind:"MATERIAL",targetRef:material.materialId});}if(!matched&&complete)add(requestedSubject?"В этой дисциплине доступных материалов не найдено.":"Доступных учебных материалов пока нет.");}
        else{
          const asksUnsubmitted=/не\s*сдан|не\s*отправ|еще\s*сда|ещё\s*сда/.test(normalized),asksLatestGrades=/последн.*оцен/.test(normalized),unsubmitted:Array<{text:string;target:C.Target}>=[],recentGrades:Array<{at:string;text:string;target:C.Target}>=[];
          let unknownSubmission=0;
          const current=learning.context.currentPeriod();if(!current){complete=false;add("Текущий учебный период не подтверждён источником.");}
          else for await(const binding of preferredBindings(learning,learning.context.periodId(current),normalized)){
            if(asksLatestGrades&&binding.kind!=="OFFERING")continue;
            const target:C.Target={kind:binding.kind==="OFFERING"?"OFFERING":"UNIT",targetRef:binding.publicContext};
            if(binding.kind==="OFFERING"&&/подгрупп/.test(normalized)){const summary=await learning.schedule.summary(binding.period,binding.source.offeringId!);add(`${binding.title}: ${summary.subgroup.label?`официальная подгруппа ${summary.subgroup.label}`:"подгруппа не подтверждена"}.`,target);continue;}
            if(binding.kind==="OFFERING"&&/балл|оцен|экзамен|зачёт|зачет|аттест/.test(normalized)){
              const result=await learning.results(binding);complete&&=result.meta.completeness===true;
              if(asksLatestGrades){
                for(const component of result.data.components){
                  if(!component.value)continue;
                  if(!component.assessedAt){complete=false;continue;}
                  recentGrades.push({at:component.assessedAt,text:`${binding.title}, ${component.label}: ${component.value.rawValueText??component.value.numeric??component.value.text??component.value.code??"значение не указано"}`,target});
                }
                const official=result.data.officialResult;
                if(official?.value){
                  if(official.assessedAt)recentGrades.push({at:official.assessedAt,text:`${binding.title}, официальный результат: ${official.value.rawValueText??official.value.numeric??official.value.text??official.value.code??"значение не указано"}`,target});
                  else complete=false;
                }
                continue;
              }
              add(`${binding.title}. Модель оценивания: ${result.data.gradingModelLabel??"не указана"}.`,target);
              for(const c of result.data.components)add(`Текущая оценка: ${binding.title}, ${c.label}: ${c.value?.rawValueText??c.value?.numeric??c.value?.text??c.value?.code??"значение не указано"}${c.maxValue?` из ${c.maxValue}`:""}.`,target);
              for(const a of result.data.attestations)add(`${binding.title}: ${a.kindLabel}, ${a.planned?date(a.planned):"дата не подтверждена"}.`,{kind:"ATTESTATION",targetRef:a.attestationId});
              const official=result.data.officialResult;add(`${binding.title}: официальный результат (оценка) — ${official?.value?.rawValueText??official?.value?.numeric??official?.value?.text??official?.value?.code??"результат пока не указан"}.`,target);
            }else{
              let cursor:string|undefined;do{const works=await learning.listWorks(binding,100,cursor);complete&&=works.meta.completeness===true;for(const w of works.data.items){
                if(asksUnsubmitted){
                  const status=w.progress?.submissionStatusCode?.toLocaleLowerCase("ru-RU")??"";
                  if(w.progress?.submittedAt||/передан|сдан|отправлен/.test(status)&&!/не\s*(?:передан|сдан|отправлен)/.test(status))continue;
                  if(/не\s*(?:передан|сдан|отправлен)/.test(status))unsubmitted.push({text:`${binding.title}: ${w.title}`,target:w.target});
                  else unknownSubmission++;
                }else add(`${binding.title}: ${w.title}${w.due?`. Срок: ${date(w.due)}`:". Срок не указан"}. Выполнение: ${w.progress?.completionStatusCode??"не указано"}; передача на проверку: ${w.progress?.submissionStatusCode??"не указана"}; проверка: ${w.progress?.reviewStatusCode??"не указана"}.`,w.target);
              }cursor=works.data.nextCursor??undefined;}while(cursor);
            }
          }
          if(asksLatestGrades){
            complete&&=!learning.context.partial;
            recentGrades.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
            if(recentGrades.length>5)complete=false;
            const shown=recentGrades.slice(0,5);
            return {text:shown.length?`Последние подтверждённые по дате оценки текущего периода:\n${shown.map(item=>`• ${formatDay(item.at.slice(0,10))}: ${item.text}`).join("\n")}`:complete?"В текущем периоде нет оценок с подтверждённой датой.":"Не удалось определить последние оценки: даты или часть результатов не подтверждены.",providerMode:"DEMO_MOCK",completeness:complete?"COMPLETE":"PARTIAL",targets:[...new Map(shown.map(item=>[item.target.targetRef,item.target])).values()],notice:mockNotice};
          }
          if(asksUnsubmitted){
            complete&&=!learning.context.partial;
            const text=unsubmitted.length?`Подтверждённые источником работы без сдачи:\n${unsubmitted.slice(0,10).map(w=>`• ${w.text}`).join("\n")}${unsubmitted.length>10?"\nПоказаны первые 10.":""}`:unknownSubmission?"По доступным работам нет подтверждения, какие из них не сданы. Отсутствие даты сдачи не означает статус «не сдано».":complete?"Подтверждённых несданных работ в текущем учебном периоде нет.":"Сведения о сдаче работ сейчас неполны. Не могу подтвердить перечень несданных работ.";
            return {text,providerMode:"DEMO_MOCK",completeness:complete&&unknownSubmission===0&&unsubmitted.length<=10?"COMPLETE":"PARTIAL",targets:unsubmitted.slice(0,10).map(w=>w.target),notice:mockNotice};
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
    let providerMode:C.AssistantAnswer["providerMode"]="DEMO_MOCK",notice=mockNotice,ids:string[],generatedText:string|undefined;
    if(fixtureMode==="error"||fixtureMode==="timeout"){ids=[];complete=false;notice="Демонстрационный источник ИИ временно недоступен. Подтверждённый ответ получить не удалось.";}
    else if(fixtureMode==="no-data"){ids=[];complete=false;}
    else if(process.env.PULS_AI_PROVIDER==="GIGACHAT"){
      if(!selectedFacts.length){ids=[];}
      else try{const generated=await new GigaChatProvider().answer(message,selectedFacts.map(({id,text})=>({id,text})),history);ids=generated.factIds;if(ids.length){generatedText=generated.text;providerMode="GIGACHAT";notice="Ответ GigaChat по разрешённым сведениям текущего студента. Проверяйте официальные данные в соответствующем разделе.";}else notice="GigaChat не выбрал подтверждённые сведения для этого вопроса.";}
      catch(error){throw providerError(error);}
    }else ids=await new DemoAssistantProvider().select(selectionQuestion,selectedFacts);
    const chosen=ids.map(id=>selectedFacts.find(f=>f.id===id)).filter((f):f is typeof facts[number]=>!!f);
    const targets=[...new Map(chosen.filter(f=>f.target).map(f=>[JSON.stringify(f.target),f.target!])).values()].slice(0,10);
    const text=chosen.length?(generatedText??chosen.map(f=>`• ${f.text}`).join("\n")):complete?"По вопросу не найдены подходящие подтверждённые сведения. Уточните дисциплину или раздел.":"Не удалось получить достаточные сведения. Попробуйте позже или откройте нужный раздел.";
    return {text:`${text}${complete?"":"\n\nЧасть сведений недоступна или не вошла в ограниченный контекст. Ответ не является полной сводкой."}`,providerMode,completeness:complete?"COMPLETE":chosen.length?"PARTIAL":"UNKNOWN",targets,notice};
  });
}
