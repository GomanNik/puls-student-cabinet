"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, UserRound, LockKeyhole } from "lucide-react";
import { api, safeClientMessage } from "@/shared/api/client";
import { loginSchema, sessionResponseSchema } from "@/shared/contracts/auth";
import { Button } from "@/shared/ui/button";

function LoginBrand({ light = false }: { light?: boolean }) {
  return <div className={`login-brand ${light ? "login-brand-light" : ""}`}>
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span><strong>ПУЛЬС</strong><small>Личный кабинет студента</small></span>
  </div>;
}

export function LoginScreen() {
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const submitting = useRef(false);
  const [values, setValues] = useState({ login: "", password: "" });
  const [error, setError] = useState("");
  const [fields, setFields] = useState({ login: "", password: "" });
  function updateField(field: keyof typeof values, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    setFields(current => ({ ...current, [field]: "" }));
    setError("");
  }
  useEffect(() => {
    const controller = new AbortController();
    const expired = new URLSearchParams(location.search).get("reason") === "expired";
    // Не читаем учётные данные из URL. Удаляем старую строку запроса целиком.
    if (location.search || location.hash) history.replaceState(null, "", location.pathname);
    Promise.resolve().then(() => {
      setReady(true);
      if (expired) setError("Сессия завершилась. Войдите снова.");
    });
    void api("/auth/me", sessionResponseSchema, { signal: controller.signal, sessionProbe: true }).then(() => location.replace("/dashboard")).catch(() => {});
    return () => controller.abort();
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ready || submitting.current) return;
    const parsed = loginSchema.safeParse(values);
    const validation = {
      login: !values.login.trim() ? "Введите логин" : !parsed.success && parsed.error.issues.some(issue => issue.path[0] === "login") ? "Проверьте логин: не более 120 символов, без управляющих знаков." : "",
      password: !values.password ? "Введите пароль" : !parsed.success && parsed.error.issues.some(issue => issue.path[0] === "password") ? "Пароль слишком длинный. Введите не более 256 символов." : "",
    };
    setFields(validation); setError("");
    if (!parsed.success) { document.getElementById(validation.login ? "login" : "password")?.focus(); return; }
    submitting.current = true;
    setBusy(true);
    try {
      await api("/auth/login", sessionResponseSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      setValues(current => ({ ...current, password: "" }));
      // Отсутствие межвкладочного канала не отменяет успешный вход.
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("puls-session"); channel.postMessage("changed"); channel.close();
        }
      } catch { /* Переход в кабинет не зависит от BroadcastChannel. */ }
      location.replace("/dashboard");
    } catch (failure) { setError(safeClientMessage(failure)); submitting.current = false; setBusy(false); }
  }
  return <main className="login-page">
    <section className="login-visual" aria-label="О проекте ПУЛЬС">
      <div className="login-scene" aria-hidden="true" />
      <header className="login-heading"><LoginBrand light /></header>
      <div className="intro"><h2>Всё важное для учёбы —<br />в одном месте.</h2><p>Ваш университет. Ваш учебный ритм. Ваш ПУЛЬС.</p></div>
    </section>
    <section className="login-form-area" aria-labelledby="login-title">
      <div className="login-card">
        <LoginBrand />
        <h1 id="login-title">Вход в аккаунт</h1>
        {/* Без name нативная форма не сериализует реквизиты при сбое JavaScript. */}
        <form className="login-form" method="post" action="/api/v1/auth/login" onSubmit={submit} aria-busy={busy} noValidate>
          <noscript><p className="error-notice" role="alert">Для безопасного входа включите JavaScript и обновите страницу.</p></noscript>
          <div className="field"><label className="sr-only" htmlFor="login">Логин</label><div className="login-input-wrap"><UserRound size={25} aria-hidden="true" /><input id="login" placeholder="Логин" autoComplete="username" autoCapitalize="none" spellCheck={false} value={values.login} onChange={event => updateField("login", event.currentTarget.value)} disabled={!ready || busy} aria-invalid={!!fields.login} aria-describedby={fields.login ? "login-error" : undefined} /></div>{fields.login && <p className="field-error" id="login-error">{fields.login}</p>}</div>
          <div className="field"><label className="sr-only" htmlFor="password">Пароль</label><div className="login-input-wrap password-field"><LockKeyhole size={25} aria-hidden="true" /><input id="password" placeholder="Пароль" type={show ? "text" : "password"} autoComplete="current-password" value={values.password} onChange={event => updateField("password", event.currentTarget.value)} disabled={!ready || busy} aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : undefined} /><button className="password-toggle" type="button" disabled={!ready || busy} aria-label={show ? "Скрыть пароль" : "Показать пароль"} aria-controls="password" aria-pressed={show} onClick={() => setShow(current => !current)}>{show ? <EyeOff size={24} aria-hidden="true" /> : <Eye size={24} aria-hidden="true" />}</button></div>{fields.password && <p className="field-error" id="password-error">{fields.password}</p>}</div>
          {error && <div className="error-notice" role="alert">{error}</div>}
          <Button type="submit" disabled={!ready || busy}>{busy ? "Проверяем данные…" : "Войти"}</Button>
        </form>
        <details className="login-help"><summary>Не удаётся войти?</summary><p>Используйте данные тестовой учётной записи.</p></details>
      </div>
    </section>
  </main>;
}
