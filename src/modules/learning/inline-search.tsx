"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { useRemote } from "@/shared/api/use-remote";
import { SearchResponseSchema } from "@/shared/contracts/student-api";
import { targetHref } from "@/shared/ui/academic";
import { RemoteState } from "@/shared/ui/remote-state";
function Results({query}:{query:string}){
  const {state,reload}=useRemote(`/academic/search?q=${encodeURIComponent(query)}&limit=10`,SearchResponseSchema);
  if(state.kind!=="ready")return <RemoteState state={state} retry={reload}/>;
  const result=state.value.data;
  return <div aria-live="polite" className="record-list">{result.completeness==="PARTIAL"&&<p className="notice">Часть источников поиска недоступна.</p>}{result.items.map(item=><Link key={`${item.kind}:${item.targetRef}`} className="search-result" href={targetHref({kind:item.kind,targetRef:item.targetRef})} prefetch={false}><strong>{item.title}</strong><span className="muted small">{item.periodLabel}{item.disciplineLabel?` · ${item.disciplineLabel}`:""}</span></Link>)}{!result.items.length&&result.completeness==="COMPLETE"&&<p>Совпадений не найдено.</p>}{result.hasMore&&<p>Уточните запрос: показаны первые десять совпадений.</p>}</div>;
}
export function InlineAcademicSearch(){
  const [text,setText]=useState(""),[query,setQuery]=useState("");
  useEffect(()=>{const timer=setTimeout(()=>setQuery(text.trim()),500);return ()=>clearTimeout(timer);},[text]);
  return <section className="surface" aria-label="Поиск дисциплины или работы"><label className="field">Найти дисциплину или работу<input type="search" value={text} maxLength={120} onChange={e=>setText(e.target.value)} placeholder="Название, не менее двух символов"/></label>{query.length>=2&&<Results key={query} query={query}/>}</section>;
}
