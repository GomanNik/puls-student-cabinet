"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useRemote } from "@/shared/api/use-remote";
import { SearchResponseSchema } from "@/shared/contracts/student-api";
import { targetHref } from "@/shared/ui/academic";
import { RemoteState } from "@/shared/ui/remote-state";
import { Button } from "@/shared/ui/button";
function Results({ query }: { query: string }) {
  const { state, reload } = useRemote(`/academic/search?q=${encodeURIComponent(query)}&limit=10`, SearchResponseSchema);
  if (state.kind !== "ready") return <RemoteState state={state} retry={reload} />;
  const result = state.value.data;
  return <section aria-label="Результаты поиска" aria-live="polite">{result.completeness === "PARTIAL" && <p className="notice notice-warning">Поиск выполнен по части источников. Отсутствие совпадений не подтверждено.</p>}<div className="record-list">{result.items.map(item => <Link className="search-result" key={item.targetRef} href={targetHref({ kind: item.kind, targetRef: item.targetRef })} prefetch={false}><span className="status-tag">{item.kind === "OFFERING" ? "Дисциплина" : "Работа"}</span><h2>{item.title}</h2><p className="muted">{item.periodLabel}{item.disciplineLabel ? ` · ${item.disciplineLabel}` : ""}</p></Link>)}</div>{!result.items.length && result.completeness === "COMPLETE" && <p className="notice">Совпадений не найдено. Попробуйте другое название.</p>}{result.hasMore && <p className="notice">Есть дополнительные совпадения. Уточните запрос — показано не более десяти результатов.</p>}</section>;
}
export function SearchScreen() {
  const params = useSearchParams(), query = (params.get("q") ?? "").trim(), [text, setText] = useState(query), router = useRouter();
  return <main id="main" className="workspace"><div className="page-heading"><div><p className="eyebrow">Быстрый переход</p><h1>Поиск по учёбе</h1><p className="muted">Дисциплины и работы во всех доступных семестрах</p></div></div><form className="academic-search-form" onSubmit={event => { event.preventDefault(); if (text.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(text.trim())}`); }}><label htmlFor="academic-query">Название дисциплины или работы</label><div><input id="academic-query" value={text} minLength={2} maxLength={120} required onChange={event => setText(event.target.value)} placeholder="Например, конспект или численные методы" /><Button type="submit"><Search size={18} />Найти</Button></div></form>{query.length >= 2 && query.length <= 120 ? <Results key={query} query={query} /> : <p className="notice">Введите от 2 до 120 символов.</p>}</main>;
}
