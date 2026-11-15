import { Suspense } from "react";
import { MaterialsScreen } from "./screen";
export default function Page() { return <Suspense fallback={<main id="main" className="workspace"><h1>Материалы</h1><p>Загружаем…</p></main>}><MaterialsScreen /></Suspense>; }
