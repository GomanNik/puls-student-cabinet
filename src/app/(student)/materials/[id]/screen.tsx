"use client";
import { PdfPreview } from "@/modules/learning/pdf-preview";
import Link from "next/link";
import { useRemote } from "@/shared/api/use-remote";
import { MaterialDetailResponseSchema } from "@/shared/contracts/student-api";
import { MaterialCards } from "@/shared/ui/academic";
import { RemoteState } from "@/shared/ui/remote-state";
import { PageHero } from "@/shared/ui/page-hero";
export function MaterialScreen({ id }: { id: string }) {
  const { state, reload } = useRemote(`/materials/${id}`, MaterialDetailResponseSchema);
  if (state.kind !== "ready") return <main id="main" className="workspace"><h1>Учебный материал</h1><RemoteState state={state} retry={reload} /></main>;
  const item = state.value.data;
  return <main id="main" className="workspace learning-r9-main"><PageHero eyebrow="УЧЕБНЫЙ МАТЕРИАЛ" title={item.title} description={item.kind==="FILE"?"Откройте сведения о файле и скачайте его, если он доступен.":"Откройте внешний ресурс, доступный в вашем учебном контексте."} image="materials-library.jpg"/><MaterialCards items={[item]} />{item.kind==="FILE"&&item.mimeType==="application/pdf"&&<PdfPreview key={item.materialId} id={item.materialId}/>}{!!item.relatedWorkIds?.length && <section className="surface"><h2>Связанные работы</h2><ul>{item.relatedWorkIds.map((work, i) => <li key={work}><Link href={`/open/${work}?kind=WORK`} prefetch={false}>Открыть связанную работу {i + 1}</Link></li>)}</ul></section>}{!!item.relatedScheduleIds?.length && <section className="surface"><h2>Связанные занятия</h2><ul>{item.relatedScheduleIds.map((schedule,i)=><li key={schedule}><Link href={`/open/${schedule}?kind=SCHEDULE`} prefetch={false}>Открыть связанное занятие {i+1}</Link></li>)}</ul></section>}</main>;
}
