import { Suspense } from "react";
import { StudyScreen } from "./screen";
export default function Page() { return <Suspense fallback={<main id="main" className="workspace"><h1>Учёба</h1><p>Загружаем…</p></main>}><StudyScreen /></Suspense>; }
