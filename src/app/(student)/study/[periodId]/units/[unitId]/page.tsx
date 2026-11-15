import { UnitScreen } from "@/modules/learning/screens";
export default async function Page({ params }: { params: Promise<{ periodId: string; unitId: string }> }) { const p = await params; return <UnitScreen periodId={p.periodId} unitId={p.unitId} />; }
