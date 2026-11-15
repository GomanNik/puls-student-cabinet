export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}>
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span><strong>ПУЛЬС</strong><small>Конкурсный прототип</small></span>
  </div>;
}
