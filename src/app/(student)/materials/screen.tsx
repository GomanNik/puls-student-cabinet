"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useRemote } from "@/shared/api/use-remote";
import { MaterialListResponseSchema, PeriodListResponseSchema } from "@/shared/contracts/student-api";
import { MaterialCards } from "@/shared/ui/academic";
import { PagedList } from "@/shared/ui/paged-list";
export function MaterialsScreen() {
  const params = useSearchParams(), router = useRouter(), periods = useRemote("/periods", PeriodListResponseSchema);
  const periodId = params.get("periodId"), offeringId = params.get("offeringId"), unitId = params.get("unitId"), filter = new URLSearchParams({ limit: "20" });
  if (periodId) filter.set("periodId", periodId); if (offeringId) filter.set("offeringId", offeringId); if (unitId) filter.set("unitId", unitId);
  const path = `/materials?${filter}`;
  return <main id="main" className="workspace"><div className="page-heading"><div><p className="eyebrow">Учебные ресурсы</p><h1>Материалы</h1><p className="muted">Файлы и ссылки из разрешённых учебных контекстов</p></div></div><label className="select-field">Учебный период<select value={periodId ?? ""} onChange={event => router.push(event.target.value ? `/materials?periodId=${encodeURIComponent(event.target.value)}` : "/materials")}><option value="">Все доступные периоды</option>{periods.state.kind === "ready" && periods.state.value.data.items.map(p => <option key={p.periodId} value={p.periodId}>{p.label}</option>)}</select></label><PagedList key={path} path={path} schema={MaterialListResponseSchema} renderItem={item => <MaterialCards key={item.materialId} items={[item]} />} empty="В этом учебном контексте нет подтверждённых материалов." /></main>;
}
