import "server-only";
import { z } from "zod";
import * as dto from "@/shared/contracts/student-api";
import { emptyQuery, pagingQuery, query, readRoute } from "@/shared/server/route";
import { pageSlice } from "@/shared/server/references";
import { learningService } from "./composition";
import { consumeAccountBudget } from "@/shared/server/service-budget";
const id = z.string().min(1).max(240);
const schemas = { offering: dto.OfferingDetailResponseSchema, works: dto.WorkListResponseSchema, work: dto.WorkDetailResponseSchema, results: dto.ResultsResponseSchema,
  attestations: dto.AttestationsResponseSchema, timeline: dto.TimelineListResponseSchema, units: dto.UnitListResponseSchema, unit: dto.UnitDetailResponseSchema,
  unitWorks: dto.WorkListResponseSchema, unitWork: dto.WorkDetailResponseSchema, unitTimeline: dto.TimelineListResponseSchema, search: dto.SearchResponseSchema,
  materials: dto.MaterialListResponseSchema, material: dto.MaterialDetailResponseSchema };
type Operation = keyof typeof schemas;
export function learningHandler(operation: Operation, params: Promise<Record<string, string>> = Promise.resolve({})) {
  return readRoute(schemas[operation] as z.ZodType<unknown>, async (auth, request) => {
    if(operation==="search")await consumeAccountBudget(auth,"SEARCH");
    const service = await learningService(auth), path = await params;
    if (operation === "search") { const f = query(request, z.strictObject({ q: z.string().trim().min(2).max(120), limit: z.coerce.number().int().min(1).max(10).default(10) })); return service.search(f.q, f.limit); }
    if (operation === "material") { query(request, emptyQuery); const result = await service.material(path.id); return { data: result.item, meta: result.meta }; }
    if (operation === "materials") {
      const f = query(request, z.strictObject({ ...pagingQuery, periodId: id.optional(), offeringId: id.optional(), unitId: id.optional() }));
      const result = await service.allMaterials(f);
      return { data: { ...pageSlice(result.items, auth.accountId, ["materials", f.periodId ?? null, f.offeringId ?? null, f.unitId ?? null, f.limit], service.context.revision, f.limit, f.cursor), isComplete: result.meta.completeness ?? null, dataState: result.items.length ? "READY" : result.meta.completeness ? "EMPTY_CONFIRMED" : "SOURCE_ERROR" }, meta: result.meta };
    }
    if (operation === "units") {
      const f = query(request, z.strictObject(pagingQuery)), result = await service.units(path.periodId);
      const items = result.items.map(u => service.unitSummary(result.period, u));
      return { data: { ...pageSlice(items, auth.accountId, ["units", path.periodId, f.limit], service.context.revision, f.limit, f.cursor), isComplete: result.complete, dataState: items.length ? "READY" : result.complete ? "EMPTY_CONFIRMED" : "UNKNOWN" }, meta: service.meta([{ items: [], state: "READY", complete: result.complete, errors: [] }]) };
    }
    const unit = operation.startsWith("unit"), binding = await service.bind(path.periodId, unit ? path.unitId : path.offeringId, unit ? "INDEPENDENT_UNIT" : "OFFERING");
    if (operation === "offering" || operation === "unit") { query(request, emptyQuery); return unit ? service.unitDetail(binding) : service.offeringDetail(binding); }
    if (operation === "work" || operation === "unitWork") { const f = query(request, z.strictObject({ stageRef: id.optional() })); return service.workDetail(binding, path.workId, f.stageRef); }
    if (operation === "results") { query(request, emptyQuery); const { data, meta } = await service.results(binding); return { data, meta }; }
    const f = query(request, z.strictObject(pagingQuery));
    if (operation === "works" || operation === "unitWorks") return service.listWorks(binding, f.limit, f.cursor);
    if (operation === "attestations") {
      const result = await service.results(binding), state = result.data.attestationsState;
      return { data: { ...pageSlice(result.data.attestations, auth.accountId, ["attestations", path.periodId, path.offeringId, f.limit], service.context.revision, f.limit, f.cursor), dataState: state.dataState, isComplete: state.isComplete }, meta: result.meta };
    }
    const timeline = await service.timeline(binding);
    return { data: { ...pageSlice(timeline.items, auth.accountId, ["timeline", path.periodId, binding.publicContext, f.limit], service.context.revision, f.limit, f.cursor), isComplete: timeline.complete, dataState: timeline.items.length ? "READY" : timeline.complete ? "EMPTY_CONFIRMED" : "UNKNOWN" }, meta: service.meta(timeline.slices) };
  });
}
