import type { PublishedWorkResult, WorkProgress } from "@/shared/contracts/student-api";
import { getWorkStatus, workStatusLabel } from "./work-status";

export function WorkStatusBadge({
  progress,
  publishedResult,
}: {
  progress?: WorkProgress;
  publishedResult?: PublishedWorkResult | null;
}) {
  const status = getWorkStatus(progress, publishedResult);
  return <span className={`status-tag work-status work-status--${status.toLowerCase()}`}>
    {workStatusLabel(status)}
  </span>;
}
