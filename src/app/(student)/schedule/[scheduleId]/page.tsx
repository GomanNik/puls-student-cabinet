import { ScheduleDetailPanel } from "@/modules/schedule/detail-panel";
export default async function Page({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  return <main id="main" className="workspace learning-r9-main"><ScheduleDetailPanel scheduleId={scheduleId} showAttendance fullPage /></main>;
}
