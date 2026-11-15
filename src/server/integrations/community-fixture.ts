import "server-only";
import { AppError } from "@/shared/server/errors";
import * as S from "./contracts";
import {studentFixture,fixtureAssignments} from "./academic-fixtures";
const source="UNIVERSITY_FIXTURE",revision="community-2026-11-13-1";
const ref=(kind:string,id:string)=>({sourceCode:source,objectKind:kind,externalId:id});
const general:S.Audience={scopeType:"UNIVERSITY",scopeId:source};
function envelope(identity:{sourceCode:string;externalStudentId:string},kind:string){
  if(identity.sourceCode!==source||!["fixture-student-a","fixture-student-b"].includes(identity.externalStudentId))throw Error("Invalid source identity");
  const mode=process.env.PULS_COMMUNITY_FIXTURE_SCENARIO??"normal";
  if(!["normal",...(["announcements","calendar"].flatMap(d=>["error","timeout","partial","no-data"].map(s=>`${d}-${s}`)))].includes(mode))throw new AppError(503,"EXTERNAL_UNAVAILABLE","Некорректная конфигурация источника событий.");
  if(mode===`${kind}-timeout`)throw new AppError(504,"EXTERNAL_TIMEOUT","Тестовый источник событий не ответил вовремя.");
  const unavailable=mode===`${kind}-error`,partial=mode===`${kind}-partial`,empty=mode===`${kind}-no-data`;
  return {sourceCode:source,requestedScope:{externalStudentId:identity.externalStudentId},availability:unavailable?"ERROR" as const:partial?"PARTIAL" as const:empty?"NO_DATA" as const:"OK" as const,isComplete:!unavailable&&!partial,fetchedAt:new Date().toISOString(),sourceRevision:revision,nextCursor:null};
}
export function announcementFixture(identity:{sourceCode:string;externalStudentId:string}){
  const e=envelope(identity,"announcements");
  const items:S.Announcement[]=[
    {ref:ref("ANNOUNCEMENT","library"),announcementId:"library",eventOccurrenceKey:"publication-library-1",title:"Неделя открытой библиотеки",body:"С 16 по 20 ноября в демонстрационной библиотеке проходят встречи о работе с учебными источниками. Вход свободный. Все сведения вымышленные.",publishedAt:"2026-11-12T09:00:00+06:00",authorLabel:"Библиотека (демо)",audiences:[general]},
    {ref:ref("ANNOUNCEMENT","student-a"),announcementId:"student-a",eventOccurrenceKey:"publication-a-1",title:"Учебный проект: консультация",body:"Для вашей учебной группы подготовлена консультация по плану индивидуального проекта. Время доступно в календаре. Демонстрационные сведения.",publishedAt:"2026-11-13T09:00:00+06:00",authorLabel:"Учебный офис (демо)",audiences:[{scopeType:"STUDENT",scopeId:"fixture-student-a"}]},
    {ref:ref("ANNOUNCEMENT","student-b"),announcementId:"student-b",eventOccurrenceKey:"publication-b-1",title:"Встреча исторического общества",body:"Демонстрационная встреча посвящена работе с историческими источниками. Подробности — в университетском календаре.",publishedAt:"2026-11-13T10:00:00+06:00",authorLabel:"Студенческий совет (демо)",audiences:[{scopeType:"STUDENT",scopeId:"fixture-student-b"}]},
  ];return S.AnnouncementReadSchema.parse({...e,items:e.availability==="ERROR"||e.availability==="NO_DATA"?[]:e.availability==="PARTIAL"?items.slice(0,1):items});
}
export function eventFixture(identity:{sourceCode:string;externalStudentId:string}){
  const e=envelope(identity,"calendar");
  const items:S.CalendarEvent[]=[
    {ref:ref("CALENDAR_EVENT","open-library"),eventId:"open-library",eventOccurrenceId:"2026-11",title:"Неделя открытой библиотеки (демо)",starts:{precision:"DATE_ONLY",on:"2026-11-16"},ends:{precision:"DATE_ONLY",on:"2026-11-20"},description:"Вымышленное университетское событие для демонстрации календаря.",location:"Учебная библиотека",audiences:[general]},
    {ref:ref("CALENDAR_EVENT","consultation"),eventId:"consultation",eventOccurrenceId:"2026-11-17",title:"Консультация по учебному проекту (демо)",starts:{precision:"DATE_TIME",at:"2026-11-17T15:00:00+06:00",timeZone:"Asia/Omsk"},ends:{precision:"DATE_TIME",at:"2026-11-17T16:00:00+06:00",timeZone:"Asia/Omsk"},location:"Аудитория 305",audiences:[{scopeType:"STUDENT",scopeId:"fixture-student-a"}]},
    {ref:ref("CALENDAR_EVENT","history-club"),eventId:"history-club",eventOccurrenceId:"2026-11-18",title:"Историческое общество (демо)",starts:{precision:"DATE_TIME",at:"2026-11-18T17:00:00+06:00",timeZone:"Asia/Omsk"},ends:{precision:"DATE_TIME",at:"2026-11-18T18:00:00+06:00",timeZone:"Asia/Omsk"},location:"Читальный зал",audiences:[{scopeType:"STUDENT",scopeId:"fixture-student-b"}]},
  ];
  // Все согласованные аудитории представлены фикстурами обоих студентов.
  for(const studentId of ["fixture-student-a","fixture-student-b"]){
    const student=studentFixture(studentId)!,context=student.context;
    const offering=student.offerings.find(o=>o.periodId==="fall-2026")!;
    const assignment=fixtureAssignments(studentId,"fall-2026","2026-11-19").find(a=>a.offeringId===offering.offeringId)!;
    const audiences:Array<[string,S.Audience]>=[
      ["Факультет",{scopeType:"FACULTY",scopeId:context.facultyId!}],
      ["Направление и курс",{scopeType:"PROGRAM_COURSE",scopeId:`${context.programId}:${context.course}`}],
      ["Группа",{scopeType:"GROUP",scopeId:context.groupId!}],
      ["Дисциплина",{scopeType:"OFFERING",scopeId:offering.offeringId}],
      ["Официальная подгруппа",{scopeType:"SUBGROUP",scopeId:assignment.subgroupId,offeringId:offering.offeringId}],
    ];
    for(const [index,[label,audience]] of audiences.entries()){
      const id=`scoped-${student.key}-${index}`;
      items.push({ref:ref("CALENDAR_EVENT",id),eventId:id,eventOccurrenceId:"2026-11-19",title:`${label}: учебная встреча (демо)`,starts:{precision:"DATE_ONLY",on:"2026-11-19"},description:"Вымышленное событие для проверки области видимости. Время источником не задано.",audiences:[audience]});
    }
  }
  return S.EventReadSchema.parse({...e,items:e.availability==="ERROR"||e.availability==="NO_DATA"?[]:e.availability==="PARTIAL"?items.slice(0,1):items});
}
