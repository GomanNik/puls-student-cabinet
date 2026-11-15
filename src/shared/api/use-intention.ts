"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { api, ApiError, safeClientMessage } from "./client";
import { ResolveResponseSchema, type ResolveOperationRequest } from "@/shared/contracts/student-api";
import { targetHref } from "@/shared/ui/academic";
type Pending={key:string;createdAt:number};
export function clearIntentions(){for(const key of Object.keys(sessionStorage))if(key.startsWith("puls-intention:"))sessionStorage.removeItem(key);}
export function useIntention<T>(scope:ResolveOperationRequest["operationScope"],path:string,schema:z.ZodType<T>,complete:(value:T)=>void){
  const storage=`puls-intention:${scope}:${path}`,intent=useRef<Pending|null>(null),payload=useRef<string|null>(null),abort=useRef<AbortController|null>(null);
  const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState<string|null>(null);
  useEffect(()=>{try{const raw=sessionStorage.getItem(storage);if(raw){const parsed=JSON.parse(raw);if(typeof parsed.key==="string"&&typeof parsed.createdAt==="number"){intent.current=parsed;setUncertain(true);setMessage("Найдена незавершённая отправка. Проверьте её результат перед новым действием.");}}}catch{setMessage("Не удалось восстановить отправку. Проверьте историю.");}return()=>abort.current?.abort();},[storage]);
  function clear(){sessionStorage.removeItem(storage);intent.current=null;payload.current=null;setUncertain(false);}
  async function submit(){
    if(busy||!intent.current)return;
    if(Date.now()-intent.current.createdAt>=24*60*60_000){setUncertain(true);setMessage("Срок ключа истёк. Проверьте историю перед новой отправкой.");return;}
    if(!payload.current){setUncertain(true);return;}
    setBusy(true);setMessage(null);const controller=new AbortController();abort.current=controller;
    try{const value=await api(path,schema,{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":intent.current.key},body:payload.current,signal:controller.signal});if(controller.signal.aborted)return;clear();complete(value);}
    catch(error){if(controller.signal.aborted)return;const definite=error instanceof ApiError&&[400,401,403,404,413,415,422,429].includes(error.status);if(definite)clear();else setUncertain(true);setMessage(definite?safeClientMessage(error):"Ответ сервера не подтверждён. Данные могли сохраниться. Проверьте результат отправки.");}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  async function send(data:unknown){
    if(busy||uncertain)return;
    if(!intent.current){intent.current={key:crypto.randomUUID(),createdAt:Date.now()};sessionStorage.setItem(storage,JSON.stringify(intent.current));payload.current=JSON.stringify(data);}
    await submit();
  }
  async function retry(){if(!payload.current||busy)return;setUncertain(false);await submit();}
  async function resolve(){
    if(!intent.current||busy)return;setBusy(true);const controller=new AbortController();abort.current=controller;
    try{const r=await api("/operations/resolve",ResolveResponseSchema,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({operationScope:scope,idempotencyKey:intent.current.key}),signal:controller.signal});if(controller.signal.aborted)return;
      if(r.data.state==="COMMITTED"&&r.data.target){clear();location.assign(targetHref(r.data.target));return;}
      setMessage(r.data.state==="PENDING"?"Сервер ещё обрабатывает отправку. Повторите проверку.":"Результат не найден или срок ключа истёк. Сначала проверьте историю. Новая отправка может создать отдельную запись.");
    }catch(error){if(!controller.signal.aborted)setMessage(safeClientMessage(error));}finally{if(!controller.signal.aborted)setBusy(false);}
  }
  function startNew(){clear();setMessage(null);}
  return {send,resolve,retry,canRetry:!!payload.current&&!!intent.current&&Date.now()-intent.current.createdAt<24*60*60_000,startNew,busy,uncertain,message};
}
