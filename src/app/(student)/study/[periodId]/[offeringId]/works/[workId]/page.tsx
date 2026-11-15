import { Suspense } from "react";
import { WorkScreen } from "@/modules/learning/screens";
export default async function Page({ params }: { params: Promise<{ periodId: string; offeringId: string; workId: string }> }) {
  const p = await params;
  return <Suspense fallback={<main id="main" className="workspace"><h1>Учебная работа</h1><p>Загружаем…</p></main>}><WorkScreen periodId={p.periodId} contextId={p.offeringId} workId={p.workId} /></Suspense>;
}
