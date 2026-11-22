import { Suspense } from "react";
import { NotificationsScreen } from "@/modules/community/screens";
export default function Page(){return <Suspense fallback={<main id="main" className="content-main"><h1>Уведомления</h1><p>Загружаем…</p></main>}><NotificationsScreen/></Suspense>;}
