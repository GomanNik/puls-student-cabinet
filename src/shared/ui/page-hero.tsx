import Image from "next/image";
import type { ReactNode } from "react";

type HeroImage =
  | "home-dashboard.jpg" | "schedule-week.jpg" | "study-overview.jpg"
  | "materials-library.jpg" | "requests-catalog.jpg" | "appeals-list.jpg"
  | "notifications-desk.jpg" | "calendar-month.jpg" | "chronology-history.jpg"
  | "course-project.jpg" | "discipline-history.jpg" | "lesson-study.jpg"
  | "independent-project.jpg" | "results-study.jpg" | "work-notes.jpg"
  | "request-form.jpg" | "request-detail.jpg" | "appeal-form.jpg"
  | "appeal-thread.jpg" | "assistant-ai.jpg";

export function PageHero({ title, description, image, action, priority = false, className = "" }: {
  eyebrow?: string;
  title: string;
  description: string;
  image?: HeroImage;
  action?: ReactNode;
  priority?: boolean;
  className?: string;
}) {
  return <header className={`page-hero ${className}`}>
    {image && <Image className="page-hero-art" src={`/puls/${image}`} alt="" fill sizes="(max-width: 640px) 100vw, 65vw" priority={priority} />}
    <div className="page-hero-copy">
      <h1>{title}</h1>
      <p>{description}</p>
      <span className="page-hero-rule" aria-hidden="true" />
    </div>
    {action && <div className="page-hero-action">{action}</div>}
  </header>;
}
