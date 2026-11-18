"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, GraduationCap, UserRound } from "lucide-react";
import { useRemote } from "@/shared/api/use-remote";
import { OfferingListResponseSchema, PeriodListResponseSchema, UnitListResponseSchema, type AcademicPeriod, type OfferingSummary } from "@/shared/contracts/student-api";
import { PagedList } from "@/shared/ui/paged-list";
import { RemoteState } from "@/shared/ui/remote-state";
import { PageHero } from "@/shared/ui/page-hero";

const disciplineImages: Record<string, string> = {
  "Математический анализ": "/puls/discipline-math.webp",
  "История России": "/puls/discipline-history-card.webp",
  "Иностранный язык": "/puls/discipline-english.webp",
  "Физическая культура": "/puls/discipline-physical-culture.webp",
  "Культурное наследие России": "/puls/discipline-heritage.webp",
};

function DisciplineCard({ offering, periodId }: { offering: OfferingSummary; periodId: string }) {
  return <Link className="study-discipline-card" href={`/study/${encodeURIComponent(periodId)}/${encodeURIComponent(offering.offeringId)}`} prefetch={false}>
        <Image className="study-discipline-card-image" src={disciplineImages[offering.title] ?? "/puls/study-overview.jpg"} alt="" fill sizes="(max-width: 700px) 100vw, 510px" />
        <span className="study-discipline-card-shade" aria-hidden="true" />
        <div className="study-discipline-card-content">
          <span className="study-discipline-card-top"><span className="study-discipline-card-subgroup">{offering.subgroup.dataState === "READY" ? offering.subgroup.label ?? "Для всей группы" : "Подгруппа не определена"}</span><ArrowRight size={19} aria-hidden="true" /></span>
          <h3 className="study-discipline-card-title">{offering.title}</h3>
          <span className="study-discipline-card-teacher"><UserRound size={15} aria-hidden="true" /><span>{offering.teacherLabel ? `Преподаватель лекций: ${offering.teacherLabel}` : "Преподаватель не указан"}</span></span>
          {offering.attestationLabel && <span className="study-discipline-card-attestation">{offering.attestationLabel}</span>}
        </div>
      </Link>;
}
function OfferingList({ periodId, periods }: { periodId: string; periods: AcademicPeriod[] }) {
  const router = useRouter();
  const [search, setSearch] = useState(""), [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim().normalize("NFKC")), 250); return () => window.clearTimeout(timer); }, [search]);
  const path = `/periods/${encodeURIComponent(periodId)}/offerings?limit=20${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""}`;
  return <div className="study-r9-layout"><div className="study-r9-primary"><section className="study-r9-section" aria-labelledby="study-offerings-title"><div className="study-r9-section-head"><h2 id="study-offerings-title"><GraduationCap size={23} aria-hidden="true" />Дисциплины</h2><label className="study-r9-period-select"><span>Учебный период</span><select value={periodId} onChange={event => router.push(`/study?period=${encodeURIComponent(event.target.value)}`)}>{periods.map(period => <option key={period.periodId} value={period.periodId}>{period.label}{period.isCurrent ? " · текущий" : ""}</option>)}</select></label></div>
    <label className="study-r9-search">Найти дисциплину<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Введите часть названия" maxLength={160} /></label>
    <div className="study-discipline-results"><PagedList key={path} path={path} schema={OfferingListResponseSchema} renderItem={offering => <DisciplineCard key={offering.offeringId} offering={offering} periodId={periodId} />} empty={debouncedSearch ? "По запросу дисциплины не найдены." : "В этом семестре нет подтверждённых дисциплин."} /></div>
  </section><section className="study-r9-section study-r9-units" aria-labelledby="study-units-title"><div className="study-r9-section-head"><h2 id="study-units-title"><BookOpen size={22} aria-hidden="true" />Самостоятельные учебные единицы</h2></div><PagedList key={`units-${periodId}`} path={`/periods/${periodId}/academic-units?limit=20`} schema={UnitListResponseSchema} renderItem={unit => <Link className="study-r9-unit-card" href={`/study/${periodId}/units/${unit.unitId}`} prefetch={false} key={unit.unitId}><BookOpen size={21} aria-hidden="true" /><span><strong>{unit.title}</strong><small>{unit.unitTypeLabel ?? "Тип учебной единицы не указан"}</small></span><ArrowRight size={19} aria-hidden="true" /></Link>} /></section></div></div>;
}
export function StudyScreen() {
  const { state, reload } = useRemote("/periods", PeriodListResponseSchema), params = useSearchParams();
  if (state.kind !== "ready") return <main id="main" className="workspace"><h1>Учёба</h1><RemoteState state={state} retry={reload} /></main>;
  const periods = state.value.data.items, requested = params.get("period");
  const selected = requested ? periods.find(p => p.periodId === requested) : periods.find(p => p.isCurrent) ?? periods[0];
  return <main id="main" className="workspace study-r9-main">
    <PageHero title="Учёба" description="Дисциплины выбранного периода, учебные работы и сроки аттестации — в одном разделе." image="study-overview.jpg" />
    {selected ? <OfferingList key={selected.periodId} periodId={selected.periodId} periods={periods} /> : <p className="notice">{requested ? "Этот учебный период недоступен." : "Подтверждённых учебных периодов пока нет."}</p>}</main>;
}
