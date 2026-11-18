"use client";
import Link from "next/link";
import { LogOut, ShieldCheck, ArrowRight } from "lucide-react";
import { useRemote } from "@/shared/api/use-remote";
import { profileResponseSchema } from "@/shared/contracts/auth";
import { PeriodListResponseSchema } from "@/shared/contracts/student-api";
import { RemoteState } from "@/shared/ui/remote-state";
import { Button } from "@/shared/ui/button";

export function ProfileScreen() {
  const { state, reload } = useRemote("/profile", profileResponseSchema);
  const periods = useRemote("/periods", PeriodListResponseSchema);
  if (state.kind !== "ready") return <main id="main"><RemoteState state={state} retry={reload} /></main>;
  const profile = state.value.data;
  const currentPeriod = periods.state.kind === "ready" ? periods.state.value.data.items.find(item => item.isCurrent) : undefined;
  const periodLabel = periods.state.kind === "error" ? "Не удалось загрузить учебный период" : periods.state.kind === "loading" ? "Загружаем учебный период…" : currentPeriod?.label ?? (periods.state.value.data.isComplete === true ? "Текущий период не указан" : "Сведения о текущем периоде неполны");
  const initials = (profile.fullName ?? "Студент").split(" ").slice(0, 2).map(word => word[0]).join("");
  function logout() { window.dispatchEvent(new Event("puls-logout")); }
  return <main id="main" className="profile-main">

    <header className="page-heading profile-heading"><div><p className="eyebrow">ЛИЧНЫЕ ДАННЫЕ</p><h1>Профиль</h1><p>Основные сведения о вашем обучении</p></div></header>
    <div className="profile-grid">
      <div className="profile-primary">
        <section className="profile-panel profile-identity" aria-labelledby="student-name">
          <div className="avatar" aria-hidden="true">{initials}</div>
          <div><p className="eyebrow">Профиль студента</p><h2 id="student-name">{profile.fullName ?? "Имя не указано"}</h2><p className="muted">Учебные сведения доступны только для просмотра</p></div>
        </section>
        <section className="profile-panel profile-details" aria-labelledby="profile-study-title">
          <h2 id="profile-study-title">Обучение</h2>
          <dl>{[
            ["Факультет", profile.faculty], ["Направление подготовки", profile.studyProgram], ["Курс", profile.course], ["Учебная группа", profile.group],
          ].map(([label, value]) => <div className="detail-row" key={label}><dt>{label}</dt><dd>{value ?? "Не указано"}</dd></div>)}</dl>
        </section>
      </div>
      <aside className="profile-aside">
        <section className="profile-panel profile-period"><h2>Учебный период</h2><p className="profile-period-name">{periodLabel}</p><p className="muted">Дисциплины и учебная деятельность доступны в разделе «Учёба».</p><Link href="/study">Перейти в раздел «Учёба» <ArrowRight size={17} aria-hidden="true" /></Link></section>
        <section className="profile-panel profile-actions"><h2>Действия</h2><Button variant="secondary" onClick={logout}><LogOut aria-hidden="true" />Выйти из кабинета</Button><p className="small muted">Поля университетского профиля здесь не редактируются.</p></section>
      </aside>
    </div>
    <p className="profile-footer"><ShieldCheck size={18} aria-hidden="true" /><span>Сведения доступны только в вашем личном кабинете. Все демонстрационные данные вымышлены.</span></p>
  </main>;
}
