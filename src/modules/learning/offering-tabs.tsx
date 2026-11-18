import Link from "next/link";

const tabs = [
  { key: "overview", label: "Обзор" },
  { key: "works", label: "Работы" },
  { key: "performance", label: "Успеваемость" },
  { key: "materials", label: "Материалы" },
] as const;

export function OfferingTabs({ base, active }: { base: string; active: string }) {
  return <nav className="learning-tabs" aria-label="Разделы дисциплины">
    {tabs.map(tab => <Link key={tab.key} href={tab.key === "works" ? `${base}/works` : `${base}?tab=${tab.key}`} prefetch={false} aria-current={active === tab.key ? "page" : undefined}>{tab.label}</Link>)}
  </nav>;
}
