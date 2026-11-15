import type { RequestBusinessTransition } from "@/server/integrations/contracts";
export type KnownTransition = { event_occurrence_key:string; to_state_code:string; changed_at:Date };
const rank:Record<string,number>={SUBMITTED:0,IN_PROGRESS:1,READY:2,REJECTED:2};
// Revision — непрозрачная строка. Порядок задают только даты событий и граф
// состояний; terminal никогда не меняется даже при другой revision.
export function advanceRequest(current:string|null, known:KnownTransition[], incoming:RequestBusinessTransition[], updatedAt:Date, highWater:Date|null) {
  if(highWater && +updatedAt<+highWater)return {changes:[],status:current,advanced:false};
  const seen=new Set(known.map(t=>t.event_occurrence_key));
  let status=current, time=known.reduce((n,t)=>Math.max(n,+t.changed_at),-Infinity);
  const changes:Array<RequestBusinessTransition & {from:string|null}>=[];
  for(const t of [...incoming].sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt))){
    if(seen.has(t.eventOccurrenceKey))continue;
    const at=Date.parse(t.occurredAt);
    if(at>+updatedAt || at<time || status===t.businessStatus || status && rank[t.businessStatus]<=rank[status])continue;
    changes.push({...t,from:status});seen.add(t.eventOccurrenceKey);status=t.businessStatus;time=at;
  }
  return {changes,status,advanced:changes.length>0};
}
