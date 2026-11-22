import type { DataState, PublishedWorkResult, WorkProgress } from "@/shared/contracts/student-api";

export type WorkStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "NOT_SUBMITTED"
  | "NOT_COMPLETED"
  | "COMPLETED"
  | "AWAITING_REVIEW"
  | "REVIEWED"
  | "RESULT_PUBLISHED"
  | "NEEDS_REVISION"
  | "UNCERTAIN"
  | "UNAVAILABLE"
  | "NOT_APPLICABLE";

export type WorkProgressLike = Partial<Pick<
  WorkProgress,
  | "assignmentStatusCode"
  | "completionStatusCode"
  | "submissionStatusCode"
  | "reviewStatusCode"
  | "completedAt"
  | "submittedAt"
  | "reviewedAt"
>> & { dataState?: DataState };

function normalize(value?: string) {
  return (value ?? "").normalize("NFKC").toLocaleLowerCase("ru-RU").replaceAll("ё", "е").trim();
}

function isNegative(value: string) {
  return /не\s*(?:отправ|сдан|передан|представ|проверен|оценен|принят|зачтен|выполн|заверш)|not submitted|not completed|not reviewed/u.test(value);
}

function isReturnedForRevision(progress?: WorkProgressLike) {
  return /доработ|возвращ|вернул|исправ|revision|returned/u.test(normalize(progress?.reviewStatusCode));
}

function isReviewed(progress?: WorkProgressLike) {
  if (progress?.reviewedAt) return true;
  const review = normalize(progress?.reviewStatusCode);
  if (isNegative(review)) return false;
  return /проверен|оценен|принят|зачтен|reviewed|graded|approved/u.test(review);
}

export function isReviewCandidate(progress?: WorkProgressLike) {
  if (!progress || progress.dataState === "SOURCE_ERROR" || progress.dataState === "FORBIDDEN"
    || progress.dataState === "UNKNOWN" || progress.dataState === "NOT_APPLICABLE") return false;
  if (isReturnedForRevision(progress) || isReviewed(progress)) return false;

  const submission = normalize(progress.submissionStatusCode);
  const review = normalize(progress.reviewStatusCode);
  if (isNegative(submission)) return false;

  return Boolean(progress.submittedAt)
    || /передан|отправлен|сдан|представлен|submitted|turned in|sent/u.test(submission)
    || /на проверк|ожидает проверки|pending review/u.test(review);
}

export function isAwaitingReview(
  progress: WorkProgressLike | undefined,
  publishedResult: PublishedWorkResult | null | undefined,
) {
  return publishedResult === null && isReviewCandidate(progress);
}

export function getWorkStatus(
  progress: WorkProgressLike | undefined,
  publishedResult: PublishedWorkResult | null | undefined,
): WorkStatus {
  if (isReturnedForRevision(progress)) return "NEEDS_REVISION";
  if (publishedResult) return "RESULT_PUBLISHED";
  if (isReviewed(progress)) return "REVIEWED";
  if (progress?.dataState === "SOURCE_ERROR" || progress?.dataState === "FORBIDDEN") return "UNAVAILABLE";
  if (progress?.dataState === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (!progress || progress.dataState === "UNKNOWN") return "UNCERTAIN";

  if (isReviewCandidate(progress)) return publishedResult === null ? "AWAITING_REVIEW" : "UNCERTAIN";

  const assignment = normalize(progress.assignmentStatusCode);
  const completion = normalize(progress.completionStatusCode);
  const submission = normalize(progress.submissionStatusCode);

  if (isNegative(submission)) return "NOT_SUBMITTED";
  if (/не\s*(?:выполн|заверш)|not completed/u.test(completion)) return "NOT_COMPLETED";
  if (progress.completedAt || /выполн|заверш|completed|finished/u.test(completion)) return "COMPLETED";
  if (/в работе|начат|выполня|in progress|started/u.test(`${completion} ${assignment}`)) return "IN_PROGRESS";
  if (/выдан|назначен|assigned|issued/u.test(assignment)) {
    const hasActivity = Boolean(progress.completedAt || progress.submittedAt || progress.reviewedAt || completion || submission);
    return publishedResult === undefined && !hasActivity ? "UNCERTAIN" : "NOT_STARTED";
  }

  return "UNCERTAIN";
}

export function workStatusLabel(status: WorkStatus) {
  return ({
    NOT_STARTED: "Не начата",
    IN_PROGRESS: "В работе",
    NOT_SUBMITTED: "Не сдана",
    NOT_COMPLETED: "Не выполнена",
    COMPLETED: "Выполнена",
    AWAITING_REVIEW: "На проверке",
    REVIEWED: "Проверена",
    RESULT_PUBLISHED: "Результат опубликован",
    NEEDS_REVISION: "Нужна доработка",
    UNCERTAIN: "Статус уточняется",
    UNAVAILABLE: "Статус недоступен",
    NOT_APPLICABLE: "Не предусмотрено",
  })[status];
}
