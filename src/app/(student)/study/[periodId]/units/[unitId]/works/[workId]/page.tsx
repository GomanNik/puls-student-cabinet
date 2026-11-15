import { Suspense } from "react";
import { WorkScreen } from "@/modules/learning/screens";
export default async function Page({ params }: { params: Promise<{ periodId: string; unitId: string; workId: string }> }) {
  const p = await params;
  return <Suspense fallback={<main id="main" className="workspace"><h1>Учебная работа</h1><p>Загружаем…</p></main>}><WorkScreen periodId={p.periodId} contextId={p.unitId} workId={p.workId} unit /></Suspense>;
}
