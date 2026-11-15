"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, FileText, Home, LogOut, Menu, MoreHorizontal, Search, UserRound, X, Bell, MessageSquare, Sparkles, Megaphone } from "lucide-react";
import { clearIntentions } from "@/shared/api/use-intention";
import { api, ApiError } from "@/shared/api/client";
import { RequestGeneration } from "@/shared/api/request-generation";
import { sessionResponseSchema, type Session } from "@/shared/contracts/auth";
import { Brand } from "./brand";
import { Button } from "./button";

const sections = [{ href: "/dashboard", label: "Главная", icon: Home }, { href: "/schedule", label: "Расписание", icon: CalendarDays }, { href: "/study", label: "Учёба", icon: BookOpen }, { href: "/materials", label: "Материалы", icon: FileText }, { href: "/requests", label: "Заявления и справки", icon: FileText }, { href: "/appeals", label: "Переписка", icon: MessageSquare }, { href: "/notifications", label: "Уведомления", icon: Bell }, { href: "/announcements", label: "Объявления", icon: Megaphone }, { href: "/calendar", label: "Календарь", icon: CalendarDays }, { href: "/assistant", label: "ИИ-помощник", icon: Sparkles }, { href: "/search", label: "Поиск по учёбе", icon: Search }, { href: "/profile", label: "Профиль", icon: UserRound }];
export function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false), [session, setSession] = useState<Session | null>(null), [error, setError] = useState<string | null>(null);
  const generation = useRef(new RequestGeneration()), leaving = useRef(false), fingerprint = useRef<string | null>(null), menuButton = useRef<HTMLButtonElement>(null), dialogRef = useRef<HTMLDialogElement>(null);
  const refresh = useCallback(async () => {
    if (leaving.current) return;
    const request = generation.current.next(); setSession(null); setError(null);
    try {
      const result = await api("/auth/me", sessionResponseSchema, { signal: request.signal });
      if (!request.isCurrent()) return;
      const actor = `${result.data.displayName}:${result.data.absoluteExpiresAt}`;
      const storedActor = sessionStorage.getItem("puls-intention-actor");
      if (storedActor && storedActor !== actor) clearIntentions();
      sessionStorage.setItem("puls-intention-actor", actor);
      if (fingerprint.current && fingerprint.current !== actor) { clearIntentions(); location.replace("/dashboard"); return; }
      fingerprint.current = actor; setSession(result.data);
    } catch (error) {
      if (!request.isCurrent()) return;
      if (error instanceof ApiError && error.status === 401) location.replace("/login?reason=expired");
      else setError("Не удалось подтвердить сессию. Проверьте соединение и повторите.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const requests = generation.current;
    const clear = () => { requests.invalidate(); flushSync(() => { setSession(null); setMenu(false); }); };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); else clear(); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void refresh(); };
    const channel = new BroadcastChannel("puls-session");
    channel.onmessage = () => { clearIntentions(); leaving.current = true; clear(); location.replace("/login"); };
    const expired = () => { clearIntentions(); leaving.current = true; clear(); location.replace("/login?reason=expired"); };
    window.addEventListener("puls-session-expired", expired);
    window.addEventListener("focus", visible); window.addEventListener("pagehide", clear); window.addEventListener("pageshow", restore); document.addEventListener("visibilitychange", visible);
    return () => { requests.invalidate(); channel.close(); window.removeEventListener("puls-session-expired", expired); window.removeEventListener("focus", visible); window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", restore); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  useEffect(() => { if (!session) return; const timer = setTimeout(() => void refresh(), Math.max(0, Date.parse(session.expiresAt) - Date.now()) + 50); return () => clearTimeout(timer); }, [session, refresh]);
  useEffect(() => {
    setMenu(false);
    const heading = document.querySelector<HTMLElement>("main h1"); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [pathname]);
  useEffect(() => { const dialog = dialogRef.current; if (!dialog) return; if (menu && !dialog.open) dialog.showModal(); else if (!menu && dialog.open) dialog.close(); }, [menu]);
  const logout = useCallback(async () => {
    clearIntentions(); sessionStorage.removeItem("puls-intention-actor");
    leaving.current = true; generation.current.invalidate(); setSession(null); setMenu(false); setError(null);
    try {
      await api("/auth/logout", null, { method: "POST" });
      const channel = new BroadcastChannel("puls-session"); channel.postMessage("changed"); channel.close(); location.replace("/login");
    } catch { setError("Выход не подтверждён. Повторите попытку."); }
  }, []);
  useEffect(() => {
    const listener = () => { void logout(); };
    window.addEventListener("puls-logout", listener);
    return () => window.removeEventListener("puls-logout", listener);
  }, [logout]);
  function links() { return sections.map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} prefetch={false} aria-current={pathname.startsWith(item.href) ? "page" : undefined} onClick={() => setMenu(false)}><Icon size={20} aria-hidden="true" />{item.label}</Link>; }); }
  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <header className="cabinet-header"><Button variant="quiet" className="menu-button" ref={menuButton} onClick={() => setMenu(true)} aria-label="Открыть меню"><Menu /></Button><Brand compact /><span className="prototype-label">Конкурсный прототип</span><div className="header-spacer" />{session && <><Link className="header-search" href="/search" aria-label="Найти дисциплину или работу"><Search size={20} /></Link><Link className="account-link" href="/profile" prefetch={false}><UserRound size={20} /><span>{session.displayName.split(" ").slice(0, 2).join(" ")}</span></Link></>}</header>
    {session ? <div className="cabinet-layout"><aside className="sidebar"><nav aria-label="Разделы кабинета">{links()}</nav><Button variant="quiet" onClick={logout}><LogOut />Выйти</Button><p className="small muted">Неофициальный сервис.<br />Все данные вымышлены.</p></aside><div className="cabinet-content">{children}</div></div> : <main id="main" className="state-panel" aria-live="polite">{error ? <><p role="alert">{error}</p><Button onClick={leaving.current ? logout : refresh}>Повторить</Button></> : <><div className="loader" /><p>{leaving.current ? "Завершаем сессию…" : "Подтверждаем сессию…"}</p></>}</main>}
    {session && <nav className="bottom-navigation" aria-label="Быстрая навигация"><Link href="/" prefetch={false}><Home size={20} />Главная</Link><Link href="/schedule" prefetch={false} aria-current={pathname.startsWith("/schedule") ? "page" : undefined}><CalendarDays size={20} />Расписание</Link><Link href="/study" prefetch={false} aria-current={pathname.startsWith("/study") ? "page" : undefined}><BookOpen size={20} />Учёба</Link><button ref={menuButton} onClick={() => setMenu(true)} aria-haspopup="dialog"><MoreHorizontal size={20} />Ещё</button></nav>}
    <dialog ref={dialogRef} className="navigation-dialog" onCancel={() => setMenu(false)} onClose={() => { setMenu(false); menuButton.current?.focus(); }} aria-labelledby="menu-title"><div className="panel-heading"><h2 id="menu-title">Разделы</h2><Button variant="quiet" onClick={() => setMenu(false)} aria-label="Закрыть меню"><X /></Button></div><nav aria-label="Все разделы">{links()}</nav><Button variant="quiet" onClick={logout}><LogOut />Выйти</Button><p className="prototype-note">Конкурсный прототип. Не является официальным сервисом университета.</p></dialog>
  </>;
}
