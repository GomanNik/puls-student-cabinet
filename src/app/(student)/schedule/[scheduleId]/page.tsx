import Link from "next/link";
import { ScheduleDetailPanel } from "@/modules/schedule/detail-panel";
export default async function Page({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  return <main id="main" className="workspace"><Link href="/schedule">← Расписание</Link><h1>Занятие</h1><section className="surface"><ScheduleDetailPanel scheduleId={scheduleId} /></section></main>;
}
