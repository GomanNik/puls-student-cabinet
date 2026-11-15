"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LogOut, ShieldCheck } from "lucide-react";
import { api, ApiError, safeClientMessage } from "@/shared/api/client";
import { RequestGeneration } from "@/shared/api/request-generation";
import { profileResponseSchema, sessionResponseSchema, type Profile, type Session } from "@/shared/contracts/auth";
import { Button } from "@/shared/ui/button";

type State = { kind: "loading" | "leaving" } | { kind: "error" | "logout-error"; message: string } | { kind: "ready"; profile: Profile; session: Session };
export function ProfileScreen() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const requests = useRef(new RequestGeneration());
  const leaving = useRef(false);
  const load = useCallback(async () => {
    if (leaving.current) return;
    const request = requests.current.next();
    setState({ kind: "loading" });
    try {
      const me = await api("/auth/me", sessionResponseSchema, { signal: request.signal });
      const profile = await api("/profile", profileResponseSchema, { signal: request.signal });
      if (request.isCurrent()) setState({ kind: "ready", profile: profile.data, session: me.data });
    } catch (error) {
      if (!request.isCurrent()) return;
      if (error instanceof ApiError && error.status === 401) { setState({ kind: "loading" }); location.replace("/login?reason=expired"); }
      else setState({ kind: "error", message: safeClientMessage(error) });
    }
  }, []);
  useEffect(() => {
    void load();
    const generation = requests.current;
    const clear = () => { generation.invalidate(); flushSync(() => setState({ kind: "loading" })); };
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onRestore = (event: PageTransitionEvent) => { if (event.persisted) void load(); };
    const channel = new BroadcastChannel("puls-session");
    channel.onmessage = () => { leaving.current = true; clear(); location.replace("/login"); };
    window.addEventListener("pagehide", clear); window.addEventListener("pageshow", onRestore);
    window.addEventListener("focus", onVisible); document.addEventListener("visibilitychange", onVisible);
    return () => { generation.invalidate(); channel.close(); window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", onRestore); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);
  const expiresAt = state.kind === "ready" ? state.session.expiresAt : undefined;
  useEffect(() => {
    if (!expiresAt) return;
    const timeout = setTimeout(() => void load(), Math.max(0, Date.parse(expiresAt) - Date.now()) + 50);
    return () => clearTimeout(timeout);
  }, [expiresAt, load]);
  async function logout() {
    window.dispatchEvent(new Event("puls-logout"));
  }
  return <>
    {state.kind === "ready" ? <main id="main" className="profile-main">
      <div className="page-heading"><div><h1>Профиль</h1><p className="muted">Ваши сведения об обучении</p></div><Button variant="secondary" onClick={logout}><LogOut aria-hidden="true" />Выйти</Button></div>
      <section className="profile-panel" aria-labelledby="student-name">
        <div className="profile-identity"><div className="avatar" aria-hidden="true">{(state.profile.fullName??"Студент").split(" ").slice(0,2).map(w => w[0]).join("")}</div><div><h2 id="student-name">{state.profile.fullName??"Не указано"}</h2><span className="demo-badge">Вымышленные демонстрационные данные</span></div></div>
        <div className="profile-details"><h2>Обучение</h2><dl>{[
          ["Факультет", state.profile.faculty], ["Направление подготовки", state.profile.studyProgram], ["Курс", state.profile.course], ["Учебная группа", state.profile.group],
        ].map(([label, value]) => <div className="detail-row" key={label}><dt>{label}</dt><dd>{value??"Не указано"}</dd></div>)}</dl></div>
      </section>
      <p className="profile-footer"><ShieldCheck size={18} aria-hidden="true" /><span>Сведения доступны только в вашем личном кабинете. Редактирование учебных данных не предусмотрено.</span></p>
    </main> : <main id="main" className="state-panel" aria-live="polite" aria-busy={state.kind === "loading" || state.kind === "leaving"}>
      {state.kind === "error" || state.kind === "logout-error" ? <><h1>Не удалось завершить действие</h1><p role="alert">{state.message}</p><Button onClick={state.kind === "logout-error" ? logout : load}>Повторить</Button></> : <><div className="loader" /><p>{state.kind === "leaving" ? "Завершаем сессию…" : "Загружаем профиль…"}</p></>}
    </main>}
  </>;
}
