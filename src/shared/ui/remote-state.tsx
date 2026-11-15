"use client";
import type { Remote } from "@/shared/api/use-remote";
import { Button } from "./button";
export function RemoteState({ state, retry }: { state: Exclude<Remote<unknown>, { kind: "ready" }>; retry: () => void }) {
  return <section className="state-panel" aria-live="polite" aria-busy={state.kind === "loading"}>
    {state.kind === "error" ? <><h2>Не удалось получить сведения</h2><p role="alert">{state.message}</p><Button onClick={retry}>Повторить</Button></> : <><div className="loader" /><p>Загружаем сведения…</p></>}
  </section>;
}
