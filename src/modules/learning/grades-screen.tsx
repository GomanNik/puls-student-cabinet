"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AcademicPeriod } from "@/shared/contracts/student-api";
import { useRemote } from "@/shared/api/use-remote";
import { RemoteState } from "@/shared/ui/remote-state";
import { GradeReportResponseSchema } from "./grades-contract";
import { assessedDate, gradeControlLabel, officialGradeLabel } from "./grades-format";

export function GradesScreen({ periodId, periods }: { periodId: string; periods: AcademicPeriod[] }) {
  const router = useRouter();
  const { state, reload } = useRemote(`/periods/${encodeURIComponent(periodId)}/grades`, GradeReportResponseSchema);
  return <section className="grades-section" aria-labelledby="grades-title">
    <div className="study-r9-section-head grades-heading">
      <div>
        <h2 id="grades-title">Оценки</h2>
        <p>Результаты экзаменов, зачётов и другой промежуточной аттестации.</p>
      </div>
      <label className="study-r9-period-select">
        <span>Учебный период</span>
        <select value={periodId} onChange={event => router.push(`/study?tab=grades&period=${encodeURIComponent(event.target.value)}`)}>
          {periods.map(period => <option key={period.periodId} value={period.periodId}>{period.label}{period.isCurrent ? " · текущий" : ""}</option>)}
        </select>
      </label>
    </div>
    {state.kind !== "ready" ? <RemoteState state={state} retry={reload} /> : <>
      {state.value.meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning" role="status">Ведомость неполная: часть результатов или форм контроля пока недоступна.</p>}
      {state.value.data.items.length ? <div className="grades-table-scroll" role="region" aria-label="Ведомость оценок" tabIndex={0}>
        <table className="grades-table">
          <caption className="visually-hidden">Официальные результаты за выбранный семестр</caption>
          <colgroup><col className="grades-col-discipline"/><col className="grades-col-control"/><col className="grades-col-result"/><col className="grades-col-date"/></colgroup>
          <thead><tr><th scope="col">Дисциплина</th><th scope="col">Форма контроля</th><th scope="col">Результат</th><th scope="col" className="grades-date">Дата</th></tr></thead>
          <tbody>{state.value.data.items.map(row => <tr key={row.offeringId}>
            <th scope="row"><Link href={`/study/${encodeURIComponent(periodId)}/${encodeURIComponent(row.offeringId)}`} prefetch={false}>{row.title}</Link></th>
            <td>{gradeControlLabel(row)}</td>
            <td><span className={row.resultState === "PENDING" ? "grades-pending" : ""}>{officialGradeLabel(row)}</span>{row.assessedAt && <span className="grades-date-mobile">{assessedDate(row.assessedAt)}</span>}</td>
            <td className="grades-date">{assessedDate(row.assessedAt)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="notice">{state.value.data.isComplete ? "Дисциплин за этот учебный период нет." : "Пока нет доступных сведений об оценках."}</p>}
    </>}
  </section>;
}
