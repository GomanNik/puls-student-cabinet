"use client";
import { useEffect, useState } from "react";
import type { Remote } from "@/shared/api/use-remote";
import { Button } from "./button";
export function RemoteState({ state, retry }: { state: Exclude<Remote<unknown>, { kind: "ready" }>; retry: () => void }) {
  if (state.kind === "loading") return <LoadingState />;
  return <section className="state-panel" style={{ margin: "24px auto" }} aria-live="polite">
    <h2>Не удалось получить сведения</h2><p role="alert">{state.message}</p><Button onClick={retry}>Повторить</Button>
  </section>;
}
function LoadingState() {
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    // Задерживается только индикатор; получение и показ данных не задерживаются.
    const timer = setTimeout(() => setShowLoading(true), 180);
    return () => clearTimeout(timer);
  }, []);
  if (!showLoading) return <section aria-busy="true" aria-label="Получение сведений" />;
  return <section className="state-panel" style={{ margin: "24px auto" }} aria-live="polite" aria-busy="true">
    <div className="loader" /><p>Загружаем сведения…</p>
  </section>;
}
