import { Suspense } from "react";
import { OfferingScreen } from "@/modules/learning/screens";
export default async function Page({ params }: { params: Promise<{ periodId: string; offeringId: string }> }) {
  const { periodId, offeringId } = await params;
  return <Suspense fallback={<main id="main" className="workspace"><h1>Дисциплина</h1><p>Загружаем…</p></main>}><OfferingScreen periodId={periodId} offeringId={offeringId} /></Suspense>;
}
