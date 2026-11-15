import { WorksPage } from "@/modules/learning/works-page";
export default async function Page({ params, searchParams }: { params: Promise<{ periodId: string; offeringId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await params; return <WorksPage periodId={p.periodId} contextId={p.offeringId} searchParams={searchParams} />;
}
