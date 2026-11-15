"use client";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { api, safeClientMessage } from "@/shared/api/client";
import { loginSchema, sessionResponseSchema } from "@/shared/contracts/auth";
import { Brand } from "@/shared/ui/brand";
import { Button } from "@/shared/ui/button";

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
    void api("/auth/me", sessionResponseSchema, { signal: controller.signal }).then(() => location.replace("/dashboard")).catch(() => {});
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
    <header className="login-heading"><Brand /><span className="small muted">Личный кабинет студента</span></header>
    <div className="login-layout">
      <aside className="intro"><div className="eyebrow">В ритме вашей учёбы</div><h2>Всё важное.<br />В одном пространстве.</h2><p>Расписание, учебная деятельность и вопросы к университету — в одном пространстве.</p><div className="intro-line" /></aside>
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">Вход в ПУЛЬС</h1><p className="muted">Личный кабинет студента</p>
        <p className="small muted">Конкурсный прототип · Не является официальным сервисом университета</p>
        {/* Без name нативная форма не сериализует реквизиты при сбое JavaScript. */}
        <form className="login-form" method="post" action="/api/v1/auth/login" onSubmit={submit} aria-busy={busy} noValidate>
          <noscript><p className="error-notice" role="alert">Для безопасного входа включите JavaScript и обновите страницу.</p></noscript>
          <div className="field"><label htmlFor="login">Логин</label><input id="login" autoComplete="username" autoCapitalize="none" spellCheck={false} value={values.login} onChange={event => updateField("login", event.currentTarget.value)} disabled={!ready || busy} aria-invalid={!!fields.login} aria-describedby={fields.login ? "login-error" : undefined} />{fields.login && <p className="field-error" id="login-error">{fields.login}</p>}</div>
          <div className="field"><label htmlFor="password">Пароль</label><div className="password-field"><input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={values.password} onChange={event => updateField("password", event.currentTarget.value)} disabled={!ready || busy} aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : undefined} /><button className="password-toggle" type="button" disabled={!ready || busy} aria-label={show ? "Скрыть пароль" : "Показать пароль"} aria-controls="password" aria-pressed={show} onClick={() => setShow(current => !current)}>{show ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></div>{fields.password && <p className="field-error" id="password-error">{fields.password}</p>}</div>
          {error && <div className="error-notice" role="alert">{error}</div>}
          <Button type="submit" disabled={!ready || busy}>{busy ? "Проверяем данные…" : <>Войти <ArrowRight aria-hidden="true" /></>}</Button>
          <p className="form-hint">Используйте предоставленные тестовые учётные данные</p>
        </form>
      </section>
    </div>
    <footer className="prototype-note">ПУЛЬС · Цифровой деканат будущего</footer>
  </main>;
}
