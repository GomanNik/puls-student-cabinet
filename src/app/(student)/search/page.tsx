import { Suspense } from "react";
import { SearchScreen } from "./screen";
export default function Page() { return <Suspense fallback={<main id="main" className="workspace"><h1>Поиск по учёбе</h1><p>Загружаем…</p></main>}><SearchScreen /></Suspense>; }
