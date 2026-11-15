import { Suspense } from "react";
import { fixtureProvider } from "@/server/integrations/fixture-provider";
import { ScheduleScreen } from "./screen";
export default function Page() {
  return <Suspense fallback={<main id="main" className="workspace"><h1>Расписание</h1><p>Загружаем…</p></main>}><ScheduleScreen today={fixtureProvider().today()} /></Suspense>;
}
