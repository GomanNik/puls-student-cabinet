"use client";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import { useSearchParams,useRouter } from "next/navigation";
import * as C from "@/shared/contracts/student-api";
import { api,safeClientMessage,ApiError } from "@/shared/api/client";
import { useRemote } from "@/shared/api/use-remote";
import { useRemoteCache } from "@/shared/api/remote-cache";
import { RemoteState } from "@/shared/ui/remote-state";
import { PagedList } from "@/shared/ui/paged-list";
import { Button } from "@/shared/ui/button";
import { PageHero } from "@/shared/ui/page-hero";
import { Bell, Check, ChevronRight } from "lucide-react";
import { academicDate,targetHref } from "@/shared/ui/academic";
import { daysBetween,formatDay,localDay } from "@/shared/lib/dates";
import { CalendarMonth,monthBounds } from "./calendar-month";
const labels:Record<C.Notification["category"],string>={ANNOUNCEMENT:"Объявления",ACADEMIC_DEADLINE:"Учебные сроки",SCHEDULE_CHANGE:"Изменения расписания",APPEAL_REPLY:"Ответы на обращения",REQUEST_STATUS:"Статусы заявок"};
const date=(d:C.AcademicDate)=>d.on??localDay(d.at!,d.timeZone!);
export function AnnouncementCard({item}:{item:C.Announcement}){return <article className="record-card"><p className="eyebrow">{item.authorLabel??"Объявление"}</p><h2><Link href={`/announcements/${item.announcementId}`}>{item.title}</Link></h2>{item.publishedAt&&<p className="small muted">{formatDay(localDay(item.publishedAt,"Asia/Omsk"))}</p>}{item.body&&<p>{item.body.slice(0,200)}{item.body.length>200?"…":""}</p>}</article>;}
export function AnnouncementsScreen(){return <main id="main" className="content-main community-r9-main"><PageHero eyebrow="СОБЫТИЯ И ИЗМЕНЕНИЯ" title="Объявления" description="Публикации, доступные в вашем учебном контексте." image="notifications-desk.jpg"/><section className="community-r9-list" aria-label="Доступные объявления"><PagedList path="/announcements" schema={C.AnnouncementListResponseSchema} renderItem={item=><AnnouncementCard key={item.announcementId} item={item}/>} empty="Опубликованных объявлений пока нет."/></section></main>;}
export function AnnouncementScreen({id}:{id:string}){const {state,reload}=useRemote(`/announcements/${id}`,C.AnnouncementDetailResponseSchema);if(state.kind!=="ready")return <RemoteState state={state} retry={reload}/>;const item=state.value.data;return <main id="main" className="content-main community-r9-main community-detail-main"><article className="community-detail-panel"><span className="page-hero-eyebrow">ОБЪЯВЛЕНИЕ</span><h1>{item.title}</h1><dl className="community-detail-meta"><div><dt>Источник</dt><dd>{item.authorLabel??"Не указан"}</dd></div><div><dt>Опубликовано</dt><dd>{item.publishedAt?formatDay(localDay(item.publishedAt,"Asia/Omsk")):"Дата не указана"}</dd></div></dl><div className="community-detail-body preserve-text">{item.body??"Дополнительный текст не опубликован."}</div><div className="community-detail-actions"><Link className="button button-secondary" href="/notifications?category=ANNOUNCEMENT">← Назад</Link></div></article></main>;}
export function NotificationCard({item,onRead}:{item:C.Notification;onRead?:()=>void}){
  const cache=useRemoteCache(),router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  async function mark(){
    if(item.isRead)return true;
    if(abort.current)return false;
    setBusy(true);setError(null);
    const c=new AbortController();abort.current=c;
    try{
      await api("/notifications/read",C.ReadResponseSchema,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({notificationKeys:[item.notificationKey]}),signal:c.signal});
      if(c.signal.aborted)return false;
      cache.markNotificationsRead([item.notificationKey]);onRead?.();
      return true;
    }catch(e){if(!c.signal.aborted)setError(safeClientMessage(e));return false;}
    finally{if(abort.current===c)abort.current=null;if(!c.signal.aborted)setBusy(false);}
  }
  const href=item.target?targetHref(item.target):null;
  const open=(event:React.MouseEvent<HTMLAnchorElement>)=>{
    if(item.isRead||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    if(href)void mark().then(saved=>{if(saved)router.push(href);});
  };
  return <article className={`notification-r9-row ${item.isRead?"":"notification-r9-unread"}`}><span className={`notification-r9-icon category-${item.category.toLowerCase()}`}><Bell size={20} aria-hidden="true"/></span><div className="notification-r9-copy"><div className="notification-r9-meta"><span>{labels[item.category]}</span><span>{item.isRead?"Прочитано":"Новое"}</span></div><h3>{href?<Link href={href} onClick={open}>{item.title}</Link>:item.title}</h3>{item.bodyPreview&&<p>{item.bodyPreview}</p>}{item.occurredAt&&<time dateTime={item.occurredAt}>{formatDay(localDay(item.occurredAt,"Asia/Omsk"))}</time>}{error&&<p className="error-notice" role="alert">{error}</p>}</div>{!item.isRead&&<Button variant="quiet" disabled={busy} onClick={()=>void mark()}>{busy?"Сохраняем…":"Отметить прочитанным"}</Button>}{href&&<Link className="notification-r9-arrow" href={href} onClick={open} aria-label={`Открыть: ${item.title}`}><ChevronRight size={19} aria-hidden="true"/></Link>}</article>;
}
export function NotificationsScreen(){
  const cache=useRemoteCache();
  const [category,setCategory]=useState(""),[unread,setUnread]=useState(false),[version,setVersion]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState<string|null>(null),abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  async function all(){if(busy||!window.confirm("Отметить прочитанными все доступные сейчас уведомления? Действие затронет и записи вне выбранного фильтра."))return;setBusy(true);const c=new AbortController();abort.current=c;try{const r=await api("/notifications/read-all",C.ReadAllResponseSchema,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:c.signal});if(c.signal.aborted)return;cache.markNotificationsRead();setNotice(r.data.completeness==="COMPLETE"?"Все доступные уведомления отмечены прочитанными.":"Доступные уведомления отмечены прочитанными. Часть источников не проверена.");setVersion(n=>n+1);}catch(e){if(!c.signal.aborted)setNotice(safeClientMessage(e));}finally{if(!c.signal.aborted)setBusy(false);}}
  const path=`/notifications?unreadOnly=${unread}${category?`&category=${category}`:""}`;
  return <main id="main" className="content-main community-r9-main"><PageHero eyebrow="СОБЫТИЯ И ИЗМЕНЕНИЯ" title="Уведомления" description="Новости, учебные сроки, изменения расписания и ответы по вашим обращениям — в одной ленте." image="notifications-desk.jpg"/><header className="community-r9-heading"><div><span className="page-hero-eyebrow">ЕДИНЫЙ ЦЕНТР</span><h2>События и изменения</h2></div><Button variant="secondary" disabled={busy} onClick={()=>void all()}><Check size={17} aria-hidden="true"/>Прочитать всё</Button></header><section className="notification-r9-panel" aria-label="Лента уведомлений"><div className="notification-r9-toolbar"><div className="notification-r9-tabs" role="group" aria-label="Состояние уведомлений"><button type="button" aria-pressed={!unread} onClick={()=>setUnread(false)}>Все</button><button type="button" aria-pressed={unread} onClick={()=>setUnread(true)}>Непрочитанные</button></div><label>Категория<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Все категории</option>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label></div>{notice&&<p className="notice" role="status">{notice}</p>}<PagedList key={`${path}:${version}`} path={path} schema={C.NotificationListResponseSchema} renderItem={item=><NotificationCard key={item.notificationKey} item={item} onRead={()=>setVersion(n=>n+1)}/>} empty="В выбранной категории уведомлений нет."/></section></main>;
}
export function CalendarCard({item}:{item:C.CalendarItem}){const href=item.target?targetHref(item.target):`/calendar/events/${item.eventKey}?on=${date(item.starts)}`;return <article className="record-card calendar-card"><p className="eyebrow">{item.origin==="UNIVERSITY_EVENT"?"Событие университета":item.origin==="ATTESTATION"?"Аттестация":"Учебный срок"}</p><h3><Link href={href}>{item.title}</Link></h3><p>{academicDate(item.starts)}{item.ends?` — ${academicDate(item.ends)}`:""}</p>{item.location&&<p>{item.location}</p>}</article>;}
export function CalendarEventScreen({id,on}:{id:string;on:string}){const {state,reload}=useRemote(`/calendar/events/${id}?on=${encodeURIComponent(on)}`,C.CalendarEventResponseSchema);if(state.kind!=="ready")return <RemoteState state={state} retry={reload}/>;const item=state.value.data;return <main id="main" className="content-main community-r9-main community-detail-main"><article className="community-detail-panel"><span className="page-hero-eyebrow">{item.origin==="UNIVERSITY_EVENT"?"СОБЫТИЕ УНИВЕРСИТЕТА":item.origin==="ATTESTATION"?"АТТЕСТАЦИЯ":"УЧЕБНЫЙ СРОК"}</span><h1>{item.title}</h1><dl className="community-detail-meta"><div><dt>Начало</dt><dd>{academicDate(item.starts)}</dd></div>{item.ends&&<div><dt>Окончание</dt><dd>{academicDate(item.ends)}</dd></div>}{item.location&&<div><dt>Место</dt><dd>{item.location}</dd></div>}</dl>{item.description&&<div className="community-detail-body preserve-text">{item.description}</div>}<div className="community-detail-actions"><Link className="button button-secondary" href="/calendar">← Назад в календарь</Link>{item.target&&item.target.kind!=="CALENDAR_EVENT"&&<Link className="button button-primary" href={targetHref(item.target)}>Открыть связанный объект →</Link>}</div></article></main>;}
function CalendarExport({query,onClose}:{query:string;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),abort=useRef<AbortController|null>(null),[format,setFormat]=useState<"ics"|"pdf"|"xlsx">("ics"),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const {state,reload}=useRemote(`/calendar/export-preview?${query}`,C.CalendarPreviewResponseSchema);
  useEffect(()=>{dialog.current?.showModal();return()=>abort.current?.abort();},[]);
  async function download(){if(state.kind!=="ready"||busy)return;setBusy(true);setError(null);const controller=new AbortController();abort.current=controller;try{
    const response=await fetch(`/api/v1/calendar/export?${query}&format=${format}&selectionToken=${encodeURIComponent(state.value.data.selectionToken)}`,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
    if(!response.ok){if(response.status===401)window.dispatchEvent(new Event("puls-session-expired"));const body=await response.json();if(body?.error?.code==="CALENDAR_SELECTION_CHANGED"){setError("Выборка изменилась или срок подтверждения истёк. Обновите предпросмотр.");void reload();return;}if(body?.error?.code==="SOURCE_INCOMPLETE")throw new Error("Часть источников недоступна. Экспорт не выполнен.");throw new ApiError(response.status,body?.error?.code??"INTERNAL_ERROR");}
    const blob=await response.blob();if(controller.signal.aborted)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`puls-calendar.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setError("Файл подготовлен и передан браузеру для скачивания.");
  }catch(e){if(!controller.signal.aborted)setError(e instanceof ApiError?safeClientMessage(e):e instanceof Error&&e.message.startsWith("Часть источников")?e.message:"Не удалось скачать файл. Повторите предпросмотр.");}finally{if(!controller.signal.aborted)setBusy(false);}}
  return <dialog className="export-dialog" ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="export-title"><h2 id="export-title">Экспорт календаря</h2>{state.kind!=="ready"?<RemoteState state={state} retry={reload}/>:<><p>Событий в полной выборке: <strong>{state.value.data.count}</strong></p><p>{formatDay(state.value.data.filterSummary.from)} — {formatDay(state.value.data.filterSummary.to)}</p><p>{state.value.data.filterSummary.eventKinds.map(k=>k==="UNIVERSITY"?"События университета":"Учебные сроки").join(", ")}</p><label className="field">Формат<select value={format} onChange={e=>setFormat(e.target.value as typeof format)}><option value="ics">ICS — импорт в календарь</option><option value="pdf">PDF — документ</option><option value="xlsx">XLSX — таблица</option></select></label><Button disabled={busy} onClick={()=>void download()}>{busy?"Готовим файл…":"Скачать выбранную выборку"}</Button><Button variant="quiet" disabled={busy} onClick={()=>void reload()}>Обновить предпросмотр</Button></>}{error&&<p role="status" className="notice">{error}</p>}<Button variant="secondary" onClick={onClose}>Закрыть</Button></dialog>;
}
export function CalendarScreen({today}:{today:string}){
  const params=useSearchParams(),router=useRouter(),bounds=monthBounds(today);
  const validDay=(raw:string|null,fallback:string)=>raw&&/^\d{4}-\d{2}-\d{2}$/.test(raw)&&!Number.isNaN(Date.parse(raw))&&new Date(raw).toISOString().slice(0,10)===raw?raw:fallback;
  const view=params.get("view")==="list"?"list":"month";
  const requestedFrom=validDay(params.get("from"),bounds.from),requestedTo=validDay(params.get("to"),bounds.to);
  const interval=daysBetween(requestedFrom,requestedTo),invalidRange=view==="list"&&(interval<0||interval>=366);
  const range=view==="month"?monthBounds(requestedFrom):invalidRange?bounds:{from:requestedFrom,to:requestedTo};
  const {from,to}=range,requestedKinds=params.get("eventKinds")?.split(","),kinds=requestedKinds?.length&&new Set(requestedKinds).size===requestedKinds.length&&requestedKinds.every(kind=>kind==="UNIVERSITY"||kind==="ACADEMIC")?requestedKinds.join(","):"UNIVERSITY,ACADEMIC";
  const [exportOpen,setExportOpen]=useState(false),[error,setError]=useState<string|null>(null),exportButton=useRef<HTMLButtonElement>(null);
  const query=new URLSearchParams({from,to,eventKinds:kinds}).toString(),path=`/calendar?${query}`;
  function change(values:Record<string,string>){const p=new URLSearchParams({from,to,eventKinds:kinds,view,...values});setExportOpen(false);router.replace(`/calendar?${p}`);}
  return <main id="main" className="content-main community-r9-main calendar-r9-main"><PageHero eyebrow="ПЛАНИРОВАНИЕ И СОБЫТИЯ" title="Календарь" description="Университетские события, учебные сроки и даты аттестации в едином календаре." image="calendar-month.jpg" action={<Button ref={exportButton} onClick={()=>setExportOpen(true)}>Экспорт календаря</Button>}/>
    <div className="calendar-toolbar"><div className="segmented-control" aria-label="Представление календаря"><Button variant={view==="month"?"primary":"secondary"} aria-pressed={view==="month"} onClick={()=>change({...monthBounds(from),view:"month"})}>Месяц</Button><Button variant={view==="list"?"primary":"secondary"} aria-pressed={view==="list"} onClick={()=>change({view:"list"})}>Список</Button></div>{view==="month"&&<label className="field">Выберите месяц<input type="month" value={from.slice(0,7)} onChange={e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){setError(null);change({...monthBounds(`${e.target.value}-01`)});}}}/></label>}</div>
    {view==="list"&&<form className="filters" key={`${from}:${to}`} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),start=String(f.get("from")),end=String(f.get("to"));if(start>end){setError("Начало диапазона должно быть не позже окончания.");return;}setError(null);change({from:start,to:end,view:"list"});}}><label className="field">С<input name="from" type="date" defaultValue={from} required/></label><label className="field">По<input name="to" type="date" defaultValue={to} required/></label><Button type="submit" variant="secondary">Показать</Button></form>}
    <div className="filters">{[["UNIVERSITY","События университета"],["ACADEMIC","Учебные сроки"]].map(([key,label])=><label key={key} className="check-field"><input type="checkbox" checked={kinds.split(",").includes(key)} onChange={e=>{const next=e.target.checked?[...kinds.split(","),key]:kinds.split(",").filter(k=>k!==key);if(!next.length){setError("Выберите хотя бы одну категорию.");return;}setError(null);change({eventKinds:next.join(",")});}}/>{label}</label>)}</div>{invalidRange&&<p role="status" className="notice notice-warning">Диапазон из адреса некорректен. Показан текущий месяц.</p>}{error&&<p role="alert" className="notice notice-warning">{error}</p>}
    {view==="month"?<CalendarMonth key={query} query={query} from={from} to={to} today={today}/>:<PagedList key={path} path={path} schema={C.CalendarListResponseSchema} renderItem={item=><CalendarCard key={item.eventKey} item={item}/>} empty="В выбранном диапазоне подтверждённых событий нет."/>}
    {exportOpen&&<CalendarExport key={query} query={query} onClose={()=>{setExportOpen(false);exportButton.current?.focus();}}/>}
  </main>;
}
