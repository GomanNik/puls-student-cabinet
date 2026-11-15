import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import ExcelJS from "exceljs";
import type { CalendarItem, AcademicDate } from "@/shared/contracts/student-api";
import { addDays, formatDay, formatTime, localDay } from "@/shared/lib/dates";
import type { Selection } from "./service";
import { AppError } from "@/shared/server/errors";
import { readConfig } from "@/shared/server/config";
const originLabels={UNIVERSITY_EVENT:"Событие университета",ACADEMIC_DEADLINE:"Учебный срок",ATTESTATION:"Аттестация"};
const dateText=(d:AcademicDate)=>d.precision==="DATE_ONLY"?`${formatDay(d.on!)} · время не задано`:`${formatDay(localDay(d.at!,d.timeZone!))}, ${formatTime(d.at!,d.timeZone!)} (${d.timeZone})`;
const escapeIcs=(v:string)=>v.replace(/\\/g,"\\\\").replace(/\r\n|\r|\n/g,"\\n").replace(/;/g,"\\;").replace(/,/g,"\\,");
const utc=(v:string)=>new Date(v).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
function folded(line:string){const lines:string[]=[];let current="",bytes=0;for(const char of line){const n=Buffer.byteLength(char,"utf8");if(bytes+n>75){lines.push(current);current=" ";bytes=1;}current+=char;bytes+=n;}lines.push(current);return lines.join("\r\n");}
function ics(items:CalendarItem[]){
  const now=utc(new Date().toISOString()),domain=new URL(readConfig().APP_ORIGIN).hostname;
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//PULS//Student Calendar//RU","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:ПУЛЬС — учебный календарь"];
  for(const item of items){lines.push("BEGIN:VEVENT",`UID:${item.eventKey}@${domain}`,`DTSTAMP:${now}`,`SUMMARY:${escapeIcs(item.title)}`);
    if(item.starts.precision==="DATE_ONLY"){
      lines.push(`DTSTART;VALUE=DATE:${item.starts.on!.replaceAll("-","")}`,`DTEND;VALUE=DATE:${addDays(item.ends?.on??item.starts.on!,1).replaceAll("-","")}`);
    }else{
      lines.push(`DTSTART:${utc(item.starts.at!)}`);
      if(item.ends?.at)lines.push(`DTEND:${utc(item.ends.at)}`);
      lines.push(`X-PULS-TIMEZONE:${escapeIcs(item.starts.timeZone!)}`);
    }
    if(item.location)lines.push(`LOCATION:${escapeIcs(item.location)}`);
    lines.push(`DESCRIPTION:${escapeIcs([originLabels[item.origin],item.starts.precision==="DATE_ONLY"?"Время не указано":undefined,item.description,"Неофициальный конкурсный прототип. Данные вымышленные."].filter(Boolean).join("\n"))}`,"END:VEVENT");
  }
  lines.push("END:VCALENDAR");return Buffer.from(lines.map(folded).join("\r\n")+"\r\n","utf8");
}
async function pdf(items:CalendarItem[],selection:Selection){
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const font=await doc.embedFont(await readFile(path.join(process.cwd(),"src/assets/fonts/NotoSans-Regular.ttf")),{subset:true});
  const supported=new Set(font.getCharacterSet());
  const safe=(s:string)=>Array.from(s).map(c=>c==="\n"||supported.has(c.codePointAt(0)!)?c:"?").join("").replace(/\r/g,"");
  doc.setTitle("События календаря ПУЛЬС");doc.setAuthor("ПУЛЬС · конкурсный прототип");doc.setLanguage("ru-RU");
  let page=doc.addPage([595.28,841.89]),y=795;
  function nextPage(){page=doc.addPage([595.28,841.89]);page.drawText("События календаря ПУЛЬС",{x:44,y:795,size:14,font});page.drawText(`${selection.from} — ${selection.to}`,{x:44,y:774,size:9,font});y=744;}
  function line(text:string,size=10,color=rgb(.12,.17,.23)){
    if(y<54)nextPage();
    page.drawText(text,{x:44,y,size,font,color});y-=size+6;
  }
  function wrapped(text:string,size=10){
    for(const paragraph of safe(text).split("\n")){
      let current="";
      for(const word of paragraph.split(/\s+/)){
        if(font.widthOfTextAtSize(`${current}${current?" ":""}${word}`,size)<=507){current+=`${current?" ":""}${word}`;continue;}
        if(current){line(current,size);current="";}
        for(const char of word){if(font.widthOfTextAtSize(current+char,size)>507){line(current,size);current="";}current+=char;}
      }line(current,size);
    }
  }
  wrapped("События календаря ПУЛЬС",20);wrapped(`${formatDay(selection.from)} — ${formatDay(selection.to)}`,11);
  wrapped(`Категории: ${selection.eventKinds.map(k=>k==="UNIVERSITY"?"события университета":"учебные сроки").join(", ")}. Событий: ${items.length}.`);
  wrapped("Неофициальный конкурсный прототип. Все данные вымышленные.",9);y-=12;
  for(const item of items){if(y<130)nextPage();wrapped(item.title,13);wrapped(originLabels[item.origin],9);wrapped(`Начало: ${dateText(item.starts)}`);if(item.ends)wrapped(`Окончание: ${dateText(item.ends)}`);if(item.location)wrapped(`Место: ${item.location}`);if(item.description)wrapped(item.description);y-=14;}
  for(const [index,p] of doc.getPages().entries())p.drawText(`${index+1} / ${doc.getPageCount()}`,{x:272,y:25,size:9,font,color:rgb(.4,.45,.5)});
  return Buffer.from(await doc.save());
}
async function xlsx(items:CalendarItem[],selection:Selection){
  const book=new ExcelJS.Workbook();book.creator="ПУЛЬС · конкурсный прототип";const sheet=book.addWorksheet("Календарь");
  sheet.columns=[{header:"Дата",key:"date",width:16},{header:"Время",key:"time",width:12},{header:"Название",key:"title",width:55},{header:"Тип",key:"origin",width:25},{header:"Дисциплина",key:"discipline",width:24},{header:"Место",key:"location",width:30},{header:"Описание",key:"description",width:65},{header:"Дата окончания",key:"endDate",width:18},{header:"Время окончания",key:"endTime",width:18},{header:"Часовой пояс",key:"zone",width:20}];
  const safe=(s:string)=>/^[\s\u0000-\u001f]*[=+@-]/u.test(s)?`'${s}`:s;
  const on=(d:AcademicDate)=>d.on??localDay(d.at!,d.timeZone!);
  for(const i of items)sheet.addRow({date:new Date(`${on(i.starts)}T00:00:00Z`),time:i.starts.at?formatTime(i.starts.at,i.starts.timeZone!):"",title:safe(i.title),origin:originLabels[i.origin],discipline:safe(i.disciplineLabel??""),location:safe(i.location??""),description:safe([i.description,i.starts.precision==="DATE_ONLY"?"Время не указано":undefined].filter(Boolean).join("\n")),endDate:i.ends?new Date(`${on(i.ends)}T00:00:00Z`):undefined,endTime:i.ends?.at?formatTime(i.ends.at,i.ends.timeZone!):"",zone:i.starts.timeZone??""});
  sheet.getColumn("date").numFmt="dd.mm.yyyy";sheet.getColumn("endDate").numFmt="dd.mm.yyyy";
  sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF243B53"}};
  sheet.eachRow(row=>{row.alignment={vertical:"top",wrapText:true};});sheet.views=[{state:"frozen",ySplit:1}];sheet.autoFilter={from:"A1",to:`J${items.length+1}`};
  const info=book.addWorksheet("О выборке");info.columns=[{width:26},{width:80}];info.addRows([["Период",`${selection.from} — ${selection.to}`],["Категории",selection.eventKinds.map(k=>k==="UNIVERSITY"?"События университета":"Учебные сроки").join(", ")],["Количество",items.length],["Статус","Неофициальный конкурсный прототип. Все данные вымышленные."],["Дата без времени","Время не задано источником; искусственная полночь не добавляется."]]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function serializeCalendar(items:CalendarItem[],selection:Selection,format:"ics"|"pdf"|"xlsx"){
  const bytes=format==="ics"?ics(items):format==="pdf"?await pdf(items,selection):await xlsx(items,selection);
  if(bytes.length>20*1024*1024)throw new AppError(413,"PAYLOAD_TOO_LARGE","Файл слишком велик. Выберите меньший диапазон.");
  return {bytes,mime:format==="ics"?"text/calendar; charset=utf-8":format==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",filename:`puls-calendar-${selection.from}-${selection.to}.${format}`};
}
