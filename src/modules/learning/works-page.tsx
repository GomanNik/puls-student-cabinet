import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authService } from "@/modules/auth/http-handlers";
import { sessionCookie } from "@/shared/server/http";
import { WorkListResponseSchema } from "@/shared/contracts/student-api";
import { learningService } from "./composition";
import { WorkCard } from "./screens";
import { AppError } from "@/shared/server/errors";

const filters = z.strictObject({ filter: z.enum(["ALL", "DUE", "RESULT"]).default("ALL"), sort: z.enum(["DUE", "ISSUED", "TITLE"]).default("DUE"), q: z.string().max(120).default(""), cursor: z.string().min(1).max(2048).optional() });
// SSR использует тот же ApplicationService и публичный DTO. REST GET /works сохраняет свой OpenAPI.
export async function WorksPage({ periodId, contextId, unit = false, searchParams }: { periodId: string; contextId: string; unit?: boolean; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const base = unit ? `/study/${periodId}/units/${contextId}` : `/study/${periodId}/${contextId}`, parsed = filters.safeParse(await searchParams);
  if (!parsed.success) return <main id="main" className="workspace"><h1>Работы</h1><p className="notice">Проверьте фильтры запроса.</p><Link href={`${base}/works`}>Сбросить фильтры</Link></main>;
  const f = parsed.data, auth = await authService().requireSession((await cookies()).get(sessionCookie)?.value, randomUUID()), service = await learningService(auth);
  const binding = await service.bind(periodId, contextId, unit ? "INDEPENDENT_UNIT" : "OFFERING");
  let page: z.infer<typeof WorkListResponseSchema>;
  try { page = WorkListResponseSchema.parse(await service.listWorks(binding, 20, f.cursor, { filter: f.filter, sort: f.sort, query: f.q })); }
  catch (error) {
    if (error instanceof AppError && (error.status === 409 || error.status === 422)) return <main id="main" className="workspace"><h1>Работы</h1><p className="notice">Список изменился или ссылка продолжения устарела.</p><Link href={`${base}/works`}>Открыть список заново</Link></main>;
    throw error;
  }
  const query = new URLSearchParams({ filter: f.filter, sort: f.sort, q: f.q });
  if (page.data.nextCursor) query.set("cursor", page.data.nextCursor);
  return <main id="main" className="workspace"><Link href={base}>← {binding.title}</Link><div className="page-heading"><div><h1>Работы и сроки</h1><p className="muted">{binding.period.label} · {binding.title}</p></div></div><form className="work-filters" method="get"><label>Название<input name="q" defaultValue={f.q} maxLength={120} placeholder="Поиск в дисциплине" /></label><label>Показать<select name="filter" defaultValue={f.filter}><option value="ALL">Все работы</option><option value="DUE">Со сроком</option><option value="RESULT">С результатом</option></select></label><label>Порядок<select name="sort" defaultValue={f.sort}><option value="DUE">По сроку</option><option value="ISSUED">По выдаче: новые сначала</option><option value="TITLE">По названию</option></select></label><button className="button button-primary" type="submit">Применить</button></form>{page.meta.sourceStatus === "PARTIAL" && <p className="notice notice-warning">Сведения неполны. Отсутствие совпадений не подтверждено.</p>}<div className="record-list">{page.data.items.map(w => <WorkCard key={w.workId} work={w} />)}</div>{!page.data.items.length && <p className="notice">{page.data.isComplete ? "Работ с выбранными условиями нет." : "Нет подтверждённых совпадений; часть сведений недоступна."}</p>}{page.data.nextCursor && <Link className="button button-secondary" href={`${base}/works?${query}`} prefetch={false}>Следующая порция</Link>}</main>;
}
