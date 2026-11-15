"use client";
import { useEffect,useRef,useState } from "react";
import { Button } from "@/shared/ui/button";
export function PdfPreview({id}:{id:string}){
  const [url,setUrl]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(false);
  const active=useRef<AbortController|null>(null),blob=useRef<string|undefined>(undefined);
  useEffect(()=>()=>{active.current?.abort();if(blob.current)URL.revokeObjectURL(blob.current);},[id]);
  async function open(){
    active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);setError(false);
    try{
      const response=await fetch(`/api/v1/materials/${encodeURIComponent(id)}/download`,{credentials:"same-origin",cache:"no-store",signal:controller.signal});
      if(response.status===401)window.dispatchEvent(new Event("puls-session-expired"));
      if(!response.ok||response.headers.get("content-type")!=="application/pdf")throw Error();
      const content=await response.blob();if(controller.signal.aborted)return;
      if(blob.current)URL.revokeObjectURL(blob.current);blob.current=URL.createObjectURL(content);setUrl(blob.current);
    }catch{if(!controller.signal.aborted)setError(true);}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="surface"><h2>Просмотр PDF</h2>{url?<><iframe title="Учебный PDF" src={url} sandbox="" style={{width:"100%",height:"65vh",border:0}}/><p className="muted">Если браузер не показывает PDF, скачайте файл по ссылке выше.</p><Button variant="secondary" onClick={()=>{if(blob.current)URL.revokeObjectURL(blob.current);blob.current=undefined;setUrl(undefined);}}>Закрыть просмотр</Button></>:<Button disabled={busy} onClick={open}>{busy?"Загружаем…":"Открыть просмотр"}</Button>}{error&&<p role="alert">Не удалось открыть файл. Повторите позже или скачайте его.</p>}</section>;
}
