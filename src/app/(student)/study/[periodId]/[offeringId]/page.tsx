import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OfferingScreen } from "@/modules/learning/screens";
export default async function Page({ params, searchParams }: { params: Promise<{ periodId: string; offeringId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { periodId, offeringId } = await params;
  if ((await searchParams).tab === "works") redirect(`/study/${encodeURIComponent(periodId)}/${encodeURIComponent(offeringId)}/works`);
  return <Suspense fallback={<main id="main" className="workspace"><h1>Дисциплина</h1><p>Загружаем…</p></main>}><OfferingScreen periodId={periodId} offeringId={offeringId} /></Suspense>;
}
