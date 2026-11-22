"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Bot, CalendarDays, FileText, Home, LogOut, Menu, MoreHorizontal, UserRound, X, Bell, MessageSquare } from "lucide-react";
import { clearIntentions } from "@/shared/api/use-intention";
import { api, ApiError, setClientSessionScope } from "@/shared/api/client";
import { RequestGeneration } from "@/shared/api/request-generation";
import { sessionResponseSchema, type Session } from "@/shared/contracts/auth";
import { RemoteCache, RemoteCacheProvider, RemoteRefreshNotice, mutationPrefixes } from "@/shared/api/remote-cache";
import { useRemote } from "@/shared/api/use-remote";
import { NotificationListResponseSchema, PeriodListResponseSchema } from "@/shared/contracts/student-api";
import { profileResponseSchema } from "@/shared/contracts/auth";
import { Brand } from "./brand";
import { Button } from "./button";
import { AssistantChatProvider, clearAssistantChatStorage } from "@/modules/assistant/chat-context";
import { HeaderAssistantSearch } from "@/modules/assistant/entry";
import { StudentIdentityContext } from "./student-identity";

const SESSION_RECHECK_MS = 5 * 60_000;
const sections = [
  { href: "/dashboard", label: "Главная", icon: Home },
  { href: "/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/study", label: "Учёба", icon: BookOpen },
  { href: "/materials", label: "Материалы", icon: BookOpen },
  { href: "/requests", label: "Заявления и справки", icon: FileText },
  { href: "/appeals", label: "Обращения", icon: MessageSquare },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/assistant", label: "ИИ-помощник", icon: Bot },
];
type Breadcrumb = { label: string; href?: string };
function breadcrumbsFor(pathname: string): Breadcrumb[] {
  if (pathname === "/dashboard") return [{ label: "Главная" }];
  const parts = pathname.split("/").filter(Boolean);
  const section = sections.find(item => item.href === `/${parts[0]}`);
  const root = section ?? (parts[0] === "announcements" ? { href: "/notifications", label: "Уведомления" } : { href: "/profile", label: "Профиль" });
  const crumbs: Breadcrumb[] = [{ label: "Главная", href: "/dashboard" }, { label: root.label, href: root.href }];
  if (parts[0] === "announcements") crumbs.push({ label: "Объявления", href: "/announcements" });
  if (parts[0] === "study" && parts.length > 2) {
    if (parts[2] === "units") {
      crumbs.push({ label: "Учебная единица", href: pathname.split("/").slice(0, 5).join("/") });
      if (parts[4] === "works") crumbs.push({ label: "Учебные работы", href: pathname.split("/").slice(0, 6).join("/") });
      if (parts[5]) crumbs.push({ label: "Работа" });
    } else {
      crumbs.push({ label: "Дисциплина", href: pathname.split("/").slice(0, 4).join("/") });
      if (parts[3] === "works") crumbs.push({ label: "Учебные работы", href: pathname.split("/").slice(0, 5).join("/") });
      if (parts[4]) crumbs.push({ label: "Работа" });
    }
  } else if (parts[0] === "calendar" && parts[1] === "events") crumbs.push({ label: "Событие" });
  else if (parts[0] === "requests" && parts[1]) crumbs.push({ label: parts[1] === "new" ? "Новое заявление" : "Заявление" });
  else if (parts[0] === "appeals" && parts[1]) crumbs.push({ label: parts[1] === "new" ? "Новое обращение" : "Переписка" });
  else if (parts[0] === "schedule" && parts[1]) crumbs.push({ label: "Занятие" });
  else if (parts[0] === "materials" && parts[1]) crumbs.push({ label: "Материал" });
  else if (parts[0] === "announcements" && parts[1]) crumbs.push({ label: "Объявление" });
  if (crumbs.length === 2 && !section && parts[0] !== "profile") crumbs[1] = { label: "Личный кабинет" };
  delete crumbs[crumbs.length - 1].href;
  return crumbs;
}
function HeaderBreadcrumbs({ pathname }: { pathname: string }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollLeft = listRef.current.scrollWidth; }, [pathname]);
  return <nav className="header-breadcrumbs" aria-label="Навигационная цепочка"><ol ref={listRef}>{breadcrumbsFor(pathname).map((crumb, index) => <li key={`${crumb.href ?? pathname}-${index}`}>{crumb.href ? <Link href={crumb.href} prefetch={false}>{crumb.label}</Link> : <strong aria-current="page">{crumb.label}</strong>}</li>)}</ol></nav>;
}
function NotificationBell() {
  const { state } = useRemote("/notifications?unreadOnly=true&limit=100", NotificationListResponseSchema, true);
  const count = state.kind === "ready" ? state.value.data.items.length : 0;
  const complete = state.kind === "ready" && state.value.meta.completeness === true;
  return <Link className="header-notifications" href="/notifications" aria-label={state.kind === "error" ? "Уведомления: сведения временно недоступны" : count ? complete ? `Уведомления, непрочитанных: ${count}` : `Уведомления, показано непрочитанных: ${count}; часть источников недоступна` : "Уведомления"} prefetch={false}>
    <Bell size={20} aria-hidden="true" />{count > 0 && <span className="header-notification-count" aria-hidden="true">{count > 99 ? "99+" : complete ? count : `${count}+`}</span>}
  </Link>;
}
export function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(), router = useRouter();
  const [menu, setMenu] = useState(false), [session, setSession] = useState<Session | null>(null), [error, setError] = useState<string | null>(null), [leavingState, setLeavingState] = useState(false);
  const [cache, setCache] = useState<RemoteCache | null>(null);
  const cacheRef = useRef<RemoteCache | null>(null), sessionRef = useRef<Session | null>(null);
  const generation = useRef(new RequestGeneration()), leaving = useRef(false), fingerprint = useRef<string | null>(null), menuButton = useRef<HTMLButtonElement>(null), mobileMenuButton = useRef<HTMLButtonElement>(null), dialogRef = useRef<HTMLDialogElement>(null);
  const pending = useRef<Promise<void> | null>(null), checkedAt = useRef(0);
  const clear = useCallback(() => {
    generation.current.invalidate(); pending.current = null; checkedAt.current = 0;
    cacheRef.current?.dispose(); cacheRef.current = null; sessionRef.current = null;
    setClientSessionScope(null); setCache(null); setSession(null); setMenu(false);
  }, []);
  const refresh = useCallback((force = false): Promise<void> => {
    if (leaving.current) return Promise.resolve();
    if (pending.current) return pending.current;
    const expires = sessionRef.current ? Math.min(Date.parse(sessionRef.current.expiresAt), Date.parse(sessionRef.current.absoluteExpiresAt)) : 0;
    if (sessionRef.current && Date.now() >= expires) clear();
    if (!force && sessionRef.current && Date.now() - checkedAt.current < SESSION_RECHECK_MS) return Promise.resolve();
    const request = generation.current.next(); setError(null);
    const timer = setTimeout(() => generation.current.invalidate(), 15_000);
    const task: Promise<void> = Promise.resolve().then(async () => {
      try {
        let scope: string | null = null;
        const result = await api("/auth/me", sessionResponseSchema, { signal: request.signal, sessionProbe: true, onSessionScope: value => { scope = value; } });
        if (!request.isCurrent()) return;
        if (!scope) throw new Error("Сервер не подтвердил область сессии.");
        if (fingerprint.current && fingerprint.current !== scope) {
          clearAssistantChatStorage(fingerprint.current);
          clear(); leaving.current = true; setLeavingState(true); try { clearIntentions(); } catch { /* Память сессии уже очищена. */ } location.replace("/dashboard"); return;
        }
        // В существующем хранилище намерений остаётся только непрозрачная метка,
        // сами профиль и учебные данные хранятся исключительно в памяти.
        try {
          const stored = sessionStorage.getItem("puls-intention-actor");
          if (stored && stored !== scope) clearIntentions();
          sessionStorage.setItem("puls-intention-actor", scope);
        } catch { /* Недоступность хранилища не блокирует чтение кабинета. */ }
        fingerprint.current = scope; setClientSessionScope(scope);
        if (!cacheRef.current) { cacheRef.current = new RemoteCache(scope); setCache(cacheRef.current); }
        sessionRef.current = result.data; checkedAt.current = Date.now(); setLeavingState(false); setSession(result.data);
      } catch (failure) {
        if (request.signal.aborted && pending.current !== task) return;
        if (failure instanceof ApiError && failure.status === 401) { clearAssistantChatStorage(fingerprint.current); clear(); location.replace("/login?reason=expired"); }
        else setError("Не удалось подтвердить сессию. Проверьте соединение и повторите.");
      } finally {
        clearTimeout(timer); if (pending.current === task) pending.current = null;
      }
    });
    pending.current = task; return task;
  }, [clear]);
  useEffect(() => {
    const currentGeneration = generation.current;
    leaving.current = false; void refresh();
    const visible = () => { if (document.visibilityState === "visible") void refresh().then(() => cacheRef.current?.revalidateActive()); };
    const hide = () => { flushSync(clear); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) void refresh(true); };
    const expired = () => { clearAssistantChatStorage(fingerprint.current); try { clearIntentions(); } catch { /* Хранилище может быть отключено. */ } leaving.current = true; setLeavingState(true); flushSync(clear); location.replace("/login?reason=expired"); };
    let channel: BroadcastChannel | undefined, dataChannel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("puls-session"); channel.onmessage = expired;
      dataChannel = new BroadcastChannel("puls-data");
      dataChannel.onmessage = event => {
        const data = event.data;
        if (data?.scope === cacheRef.current?.scope && typeof data?.path === "string")
          cacheRef.current?.invalidate(mutationPrefixes(data.path), document.visibilityState === "visible");
      };
    } catch { /* При возвращении во вкладку сессию всё равно проверяет сервер. */ }
    const changed = (event: Event) => {
      const data = (event as CustomEvent<{ path: string; scope: string }>).detail;
      const current = cacheRef.current;
      if (!data || !current || data.scope !== current.scope) return;
      current.invalidate(mutationPrefixes(data.path), document.visibilityState === "visible");
      try { dataChannel?.postMessage(data); } catch { /* Локальная инвалидация уже выполнена. */ }
    };
    // Обновляются только открытые блоки и только в видимой вкладке.
    const timer = setInterval(() => { if (document.visibilityState === "visible" && sessionRef.current) cacheRef.current?.revalidateActive(); }, 120_000);
    window.addEventListener("puls-session-expired", expired); window.addEventListener("puls-data-changed", changed);
    window.addEventListener("focus", visible); window.addEventListener("pagehide", hide); window.addEventListener("pageshow", restore); document.addEventListener("visibilitychange", visible);
    return () => {
      currentGeneration.invalidate(); pending.current = null; cacheRef.current?.dispose(); cacheRef.current = null; setClientSessionScope(null);
      clearInterval(timer); channel?.close(); dataChannel?.close();
      window.removeEventListener("puls-session-expired", expired); window.removeEventListener("puls-data-changed", changed);
      window.removeEventListener("focus", visible); window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", restore); document.removeEventListener("visibilitychange", visible);
    };
  }, [clear, refresh]);
  useEffect(() => {
    if (!session) return;
    const expires = Math.min(Date.parse(session.expiresAt), Date.parse(session.absoluteExpiresAt));
    const timer = setTimeout(() => { clear(); void refresh(true); }, Math.max(0, expires - Date.now()) + 20);
    return () => clearTimeout(timer);
  }, [session, clear, refresh]);
  useEffect(() => {
    if (pathname === "/assistant") return;
    const heading = document.querySelector<HTMLElement>("main h1"); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }, [pathname]);
  useEffect(() => { const dialog = dialogRef.current; if (!dialog) return; if (menu && !dialog.open) dialog.showModal(); else if (!menu && dialog.open) dialog.close(); }, [menu]);
  const logout = useCallback(async () => {
    const currentScope = fingerprint.current;
    clearAssistantChatStorage(currentScope);
    leaving.current = true; setLeavingState(true); clear(); setError(null);
    try { clearIntentions(); sessionStorage.removeItem("puls-intention-actor"); } catch { /* Нет сохранённых данных кэша. */ }
    try {
      await api("/auth/logout", null, { method: "POST" });
      try { const channel = new BroadcastChannel("puls-session"); channel.postMessage("changed"); channel.close(); } catch { /* Выход уже подтверждён сервером. */ }
      location.replace("/login");
    } catch { setError("Выход не подтверждён. Повторите попытку."); }
  }, [clear]);
  const prefetched = useRef(new Map<string, number>());
  const prefetch = useCallback((href: string) => {
    if (!cacheRef.current || leaving.current || Date.now() - (prefetched.current.get(href) ?? 0) < 30_000) return;
    prefetched.current.set(href, Date.now()); router.prefetch(href);
    // Только короткие справочники и профиль по намерению перейти, не весь кабинет.
    if (href === "/study" || href === "/materials") void cacheRef.current.ensure(cacheRef.current.entry("/periods", PeriodListResponseSchema));
    if (href === "/profile") void cacheRef.current.ensure(cacheRef.current.entry("/profile", profileResponseSchema));
  }, [router]);
  useEffect(() => {
    const listener = () => { void logout(); };
    window.addEventListener("puls-logout", listener);
    return () => window.removeEventListener("puls-logout", listener);
  }, [logout]);
  function links() { return sections.map(item => { const Icon = item.icon; const active = pathname.startsWith(item.href) || (item.href === "/notifications" && pathname.startsWith("/announcements")); return <Link key={item.href} href={item.href} prefetch={false} onMouseEnter={() => prefetch(item.href)} onFocus={() => prefetch(item.href)} aria-current={active ? "page" : undefined} onClick={() => setMenu(false)}><Icon size={20} aria-hidden="true" />{item.label}</Link>; }); }
  const ready = Boolean(session && cache);
  return <StudentIdentityContext.Provider value={session?.displayName ?? ""}><AssistantChatProvider scope={cache?.scope ?? null} absoluteExpiresAt={session?.absoluteExpiresAt ?? null}>
    <>
      <a className="skip-link" href="#main">Перейти к содержимому</a>
      {ready && session && cache ? <RemoteCacheProvider cache={cache}>
        <div className={`cabinet-frame${pathname === "/assistant" ? " cabinet-frame-chat" : ""}`}>
          <aside className="sidebar">
            <div className="sidebar-brand"><Brand href="/dashboard" /><span>Личный кабинет студента</span></div>
            <nav aria-label="Разделы кабинета">{links()}</nav>
            <div className="sidebar-bottom">
              <Link href="/profile" prefetch={false} onMouseEnter={() => prefetch("/profile")} onFocus={() => prefetch("/profile")} aria-current={pathname.startsWith("/profile") ? "page" : undefined}><UserRound size={20} aria-hidden="true" />Профиль</Link>
              <Button variant="quiet" onClick={logout}><LogOut />Выйти</Button>
              <p className="prototype-full">Конкурсный прототип<br />Не является официальным сервисом университета</p>
            </div>
          </aside>
          <div className="cabinet-main">
            <header className="cabinet-header">
              <Button variant="quiet" className="menu-button" ref={menuButton} onClick={() => setMenu(true)} aria-label="Открыть меню"><Menu /></Button>
              <Brand compact href="/dashboard" />
              <span className="prototype-label">Конкурсный прототип</span>
              <HeaderBreadcrumbs pathname={pathname} />
              <HeaderAssistantSearch />
              <NotificationBell />
              <Link className="account-link" href="/profile" prefetch={false} onMouseEnter={() => prefetch("/profile")} onFocus={() => prefetch("/profile")}><span className="account-avatar" aria-hidden="true">{session.displayName.trim().slice(0,1)}</span><span>{session.displayName.split(" ").slice(0, 2).join(" ")}</span></Link>
            </header>
            <div className="cabinet-content">{error && <p className="notice notice-warning" role="alert">{error} <Button variant="quiet" onClick={() => void refresh(true)}>Повторить</Button></p>}<RemoteRefreshNotice />{children}</div>
          </div>
        </div>
      </RemoteCacheProvider> : <main id="main" className="state-panel" aria-live="polite">{error ? <><p role="alert">{error}</p><Button onClick={() => { if (leaving.current) void logout(); else void refresh(true); }}>Повторить</Button></> : <><div className="loader" /><p>{leavingState ? "Завершаем сессию…" : "Подтверждаем сессию…"}</p></>}</main>}
      {session && <nav className={`bottom-navigation${pathname === "/assistant" ? " bottom-navigation-hidden" : ""}`} aria-label="Быстрая навигация"><Link href="/dashboard" prefetch={false} aria-current={pathname.startsWith("/dashboard") ? "page" : undefined}><Home size={20} />Главная</Link><Link href="/schedule" prefetch={false} aria-current={pathname.startsWith("/schedule") ? "page" : undefined}><CalendarDays size={20} />Расписание</Link><Link href="/study" prefetch={false} aria-current={pathname.startsWith("/study") ? "page" : undefined}><BookOpen size={20} />Учёба</Link><button ref={mobileMenuButton} onClick={() => setMenu(true)} aria-haspopup="dialog"><MoreHorizontal size={20} />Ещё</button></nav>}
      <dialog ref={dialogRef} className="navigation-dialog" onCancel={() => setMenu(false)} onClose={() => { setMenu(false); (window.innerWidth < 600 ? mobileMenuButton.current : menuButton.current)?.focus(); }} aria-labelledby="menu-title"><div className="panel-heading"><h2 id="menu-title">Разделы</h2><Button variant="quiet" onClick={() => setMenu(false)} aria-label="Закрыть меню"><X /></Button></div><nav aria-label="Все разделы">{links()}<Link href="/profile" onClick={() => setMenu(false)}><UserRound size={20} aria-hidden="true" />Профиль</Link></nav><Button variant="quiet" onClick={logout}><LogOut />Выйти</Button><p className="prototype-note">Конкурсный прототип. Не является официальным сервисом университета.</p></dialog>
    </>
  </AssistantChatProvider></StudentIdentityContext.Provider>;
}
