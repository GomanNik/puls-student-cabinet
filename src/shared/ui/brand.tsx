import Link from "next/link";

export function Brand({ compact = false, href }: { compact?: boolean; href?: string }) {
  const className = `brand ${compact ? "brand-compact" : ""}`;
  const content = <>
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span><strong>ПУЛЬС</strong><small>Конкурсный прототип</small></span>
  </>;
  return href ? <Link className={className} href={href} prefetch={false} aria-label="ПУЛЬС — главная страница">{content}</Link> : <div className={className}>{content}</div>;
}
