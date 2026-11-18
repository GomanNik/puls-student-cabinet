import { Suspense } from "react";
import { RequestForm } from "@/modules/operations/screens";
export default function Page(){return <Suspense fallback={<main id="main" className="content-main"><h1>Новая заявка</h1><p>Загружаем форму…</p></main>}><RequestForm/></Suspense>;}
