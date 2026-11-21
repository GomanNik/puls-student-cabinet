import "server-only";
import type * as C from "@/shared/contracts/student-api";
import type { LearningService, LearningBinding } from "@/modules/learning/service";
import { addDays, formatDay, formatTime } from "@/shared/lib/dates";
import { GigaChatError, GigaChatProvider, type AssistantFact, type AssistantPlan, type AssistantTopic, type AssistantTurn } from "@/server/integrations/assistant-provider";

type Fact = AssistantFact & { target?: C.Target };
type AcademicResult = { answer: C.AssistantAnswer; topic: AssistantTopic; sources: { name: string; state: "FOUND" | "EMPTY" | "PARTIAL" | "UNAVAILABLE"; count: number }[]; contextSent: boolean; modelUsed?: string; fallback?: string };
const normalize = (s: string) => s.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

function demoPlan(question: string, history: AssistantTurn[], disciplines: string[]): AssistantPlan {
  const q = normalize(question), previous = normalize(history.at(-2)?.content ?? "");
  const continuation = /^(а\s|еще|кто еще|что дальше|расскажи подробнее|по другому|а завтра)/u.test(q);
  const subject = disciplines.find(title => normalize(title).split(" ").some(word => word.length > 4 && q.includes(word.slice(0, 5))))
    ?? (continuation ? disciplines.find(title => previous.includes(normalize(title))) : undefined);
  const topic: AssistantTopic = /преподав|кто ведет|кто проводит/u.test(q) || continuation && /преподав|кто ведет/u.test(previous) ? "TEACHERS"
    : /расписан|заняти|пара|лекци|завтра|сегодня|недел|перенос|отмен/u.test(q) ? "SCHEDULE"
    : /работ|задан|срок|провер|сдать|выполн/u.test(q) ? "WORKS"
    : /оцен|балл|результат|аттест|экзамен|зачет/u.test(q) ? "RESULTS"
    : /предмет|дисциплин|изуча|семестр/u.test(q) ? "DISCIPLINES" : "OTHER_ACADEMIC";
  return { topic, discipline: subject ?? null, teacher: null, followUp: continuation };
}

async function pageSchedule(learning: LearningService, from: string, to: string) {
  const items: C.ScheduleEntry[] = []; let complete = true, cursor: string | undefined;
  do { const page = await learning.schedule.list({ from, to }, 100, cursor); items.push(...page.data.items); complete &&= page.meta.completeness === true; cursor = page.data.nextCursor ?? undefined; } while (cursor);
  return { items, complete };
}

export async function answerAcademicQuery(message: string, history: AssistantTurn[], learning: LearningService, providerMode: "GIGACHAT" | "DEMO_MOCK"): Promise<AcademicResult | null> {
  if (/^(?:покажи|найди|поищи|поиск)\s+(?:мои\s+)?(?:работы|дисциплины|предметы)\s+по\s+/iu.test(message)) return null;
  const period = learning.context.currentPeriod();
  const bindings: LearningBinding[] = [];
  if (period) for await (const binding of learning.bindings(learning.context.periodId(period))) bindings.push(binding);
  const titles = bindings.map(binding => binding.title);
  const provider = providerMode === "GIGACHAT" ? new GigaChatProvider() : null;
  let planFallback: string | undefined;
  let planned: AssistantPlan;
  try { planned = provider ? await provider.plan(message, history, titles) : demoPlan(message, history, titles); }
  catch (error) {
    if (!(error instanceof GigaChatError) || error.kind !== "INVALID_RESPONSE") throw error;
    planned = demoPlan(message, history, titles);
    planFallback = "GigaChat вернул некорректный план запроса; использована локальная классификация.";
  }
  const q = normalize(message);
  const explicitDiscipline = titles.find(title => normalize(title).split(" ").some(word => word.length > 4 && q.includes(word.slice(0, 5))));
  const forcedTopic: AssistantTopic | undefined = /кто\s+ведет|какие\s+преподаватели|кто\s+еще\s+преподает|предмет.*ведет/u.test(q) ? "TEACHERS"
    : /следующ.*(?:пар|заняти|лекци)|завтра|расписан|что\s+будет\s+дальше/u.test(q) ? "SCHEDULE"
    : /что.*нужно\s+сделать|задан|работ|проверено|выполн|срок/u.test(q) ? "WORKS" : undefined;
  const plan: AssistantPlan = { ...planned, topic: /по\s+другому\s+предмету/u.test(q) && !explicitDiscipline ? "CLARIFY" : forcedTopic ?? planned.topic, discipline: explicitDiscipline ?? (titles.includes(planned.discipline ?? "") ? planned.discipline : null), followUp: planned.followUp || /^(?:а\s|кто\s+еще|какие\s+еще)/u.test(q) };
  if (/этой\s+дисциплине/u.test(q) && !plan.discipline) plan.topic = "CLARIFY";
  if (plan.topic === "GENERAL" && provider) {
    const reply = await provider.answer(message, [], history);
    return { answer: { text: reply.text, providerMode: "GIGACHAT", completeness: "UNKNOWN", targets: [] }, topic: plan.topic, sources: [], contextSent: false, modelUsed: process.env.GIGACHAT_MODEL ?? "GigaChat-2" };
  }
  if (!["TEACHERS", "DISCIPLINES", "SCHEDULE", "WORKS", "RESULTS", "CLARIFY"].includes(plan.topic)) return null;
  if (plan.topic === "CLARIFY") return { answer: { text: "Уточните, пожалуйста, дисциплину или преподавателя, о котором хотите узнать.", providerMode: "DEMO_MOCK", completeness: "UNKNOWN", targets: [] }, topic: plan.topic, sources: [], contextSent: false };
  if (!plan.discipline && /(?:^|\s)по\s+(?!предмет|дисциплин|расписан|работ|заняти)([а-яё]{5,})/u.test(q) && !/по\s+(?:другому|моему|своему)/u.test(q)) return { answer: { text: "Не удалось сопоставить указанное название с вашими дисциплинами. Уточните предмет.", providerMode: "DEMO_MOCK", completeness: learning.context.partial ? "UNKNOWN" : "COMPLETE", targets: [] }, topic: plan.topic, sources: [{ name: "Дисциплины текущего периода", state: learning.context.partial ? "PARTIAL" : "EMPTY", count: 0 }], contextSent: false };
  const selected = plan.discipline ? bindings.filter(binding => binding.title === plan.discipline) : bindings;
  const facts: Fact[] = [], sources: AcademicResult["sources"] = [];
  let complete = !learning.context.partial && !!period;
  const add = (text: string, target?: C.Target) => { if (facts.length < 50) facts.push({ id: `f${facts.length + 1}`, text, target }); else complete = false; };
  const source = (name: string, count: number, ok: boolean) => { sources.push({ name, count, state: ok ? count ? "FOUND" : "EMPTY" : count ? "PARTIAL" : "UNAVAILABLE" }); complete &&= ok; };
  try {
    if (plan.topic === "TEACHERS" || plan.topic === "DISCIPLINES") {
      for (const binding of selected) {
        if (binding.kind !== "OFFERING") { if (plan.topic === "DISCIPLINES" && /самостоятельн|единиц|проект|изуча/u.test(q)) add(`Самостоятельная учебная единица: ${binding.title}.`, { kind: "UNIT", targetRef: binding.publicContext }); continue; }
        const summary = await learning.schedule.summary(binding.period, binding.source.offeringId!);
        const target = summary.target;
        if (plan.topic === "DISCIPLINES") add(`Дисциплина текущего периода: ${summary.title}${summary.teacherLabel ? `. Преподаватель, указанный в карточке: ${summary.teacherLabel}` : ""}.`, target);
        else if (summary.teacherLabel) add(`Дисциплина ${summary.title}: преподаватель, указанный в карточке дисциплины — ${summary.teacherLabel}.`, target);
      }
      source("Дисциплины текущего периода", facts.length, !learning.context.partial && !!period);
      if (plan.topic === "TEACHERS" && period) {
        const from = learning.context.today, to = period.endsOn && period.endsOn < addDays(from, 28) ? period.endsOn : addDays(from, 28);
        if (from <= to) {
          const schedule = await pageSchedule(learning, from, to), seen = new Set<string>(); let count = 0;
          for (const item of schedule.items) {
            if (!item.teacherLabel || !selected.some(binding => binding.publicContext === item.offeringId)) continue;
            const key = `${item.title}|${item.teacherLabel}`;
            if (seen.has(key)) continue;
            seen.add(key); count++;
            add(`По доступному расписанию дисциплины ${item.title} занятие ведёт ${item.teacherLabel}.`, item.target);
          }
          source("Личное расписание на 28 дней", count, schedule.complete);
        }
      }
    } else if (plan.topic === "SCHEDULE") {
      const q = normalize(message), today = learning.context.today;
      const from = /завтра/u.test(q) ? addDays(today, 1) : today;
      const to = /следующ|ближайш/u.test(q) ? addDays(from, 28) : /недел/u.test(q) ? addDays(from, 7) : from;
      const schedule = await pageSchedule(learning, from, to);
      let items = schedule.items.filter(item => selected.some(binding => binding.publicContext === item.offeringId));
      if (/лекци/u.test(q)) items = items.filter(item => /лекци/u.test(normalize(item.lessonType ?? "")));
      if (/следующ|ближайш/u.test(q)) items = items.filter(item => item.status !== "CANCELLED" && !!item.plannedStart && Date.parse(item.plannedStart) > Date.now()).slice(0, 1);
      for (const item of items) add(`Занятие: ${item.title}${item.lessonType ? ` (${item.lessonType})` : ""}: ${item.plannedStart && item.timeZone ? `${formatDay(item.plannedStart.slice(0, 10))}, ${formatTime(item.plannedStart, item.timeZone)}` : "время не указано"}${item.teacherLabel ? `; преподаватель ${item.teacherLabel}` : ""}${item.room ? `; аудитория ${item.room}` : ""}; статус ${item.status === "CANCELLED" ? "отменено" : item.status === "RESCHEDULED" ? "перенесено" : "по плану"}.`, item.target);
      source("Личное расписание", items.length, schedule.complete);
    } else if (plan.topic === "WORKS") {
      let count = 0;
      for (const binding of selected) {
        let cursor: string | undefined;
        do { const page = await learning.listWorks(binding, 100, cursor); complete &&= page.meta.completeness === true;
          for (const work of page.data.items) {
            const dueDay = work.due?.on ?? work.due?.at?.slice(0, 10);
            if (/приближа|ближайш|скоро/u.test(q) && (!dueDay || dueDay < learning.context.today || dueDay > addDays(learning.context.today, 7))) continue;
            if (/уже\s+проверен/u.test(q) && !/проверено/u.test(normalize(work.progress?.reviewStatusCode ?? ""))) continue;
            count++; add(`Работа ${work.title}; дисциплина ${binding.title}${dueDay ? `; срок ${formatDay(dueDay)}` : "; срок не указан"}; выполнение: ${work.progress?.completionStatusCode ?? "не указано"}; сдача: ${work.progress?.submissionStatusCode ?? "не указана"}; проверка: ${work.progress?.reviewStatusCode ?? "не указана"}.`, work.target);
          }
          cursor = page.data.nextCursor ?? undefined; } while (cursor);
      }
      source("Учебные работы", count, complete);
    } else if (plan.topic === "RESULTS") {
      let count = 0;
      for (const binding of selected.filter(item => item.kind === "OFFERING")) {
        const result = await learning.results(binding); complete &&= result.meta.completeness === true;
        const target: C.Target = { kind: "OFFERING", targetRef: binding.publicContext };
        for (const component of result.data.components) { count++; add(`Дисциплина ${binding.title}, ${component.label}: ${component.value?.rawValueText ?? component.value?.numeric ?? component.value?.text ?? "результат пока не указан"}.`, target); }
        if (result.data.officialResult) { count++; const value = result.data.officialResult.value; add(`Дисциплина ${binding.title}, официальный результат: ${value?.rawValueText ?? value?.numeric ?? value?.text ?? "пока не указан"}.`, target); }
      }
      source("Результаты текущего периода", count, complete);
    }
  } catch { source("Учебный источник", 0, false); }
  const teacherNames = [...new Set(facts.map(fact => fact.text.match(/(?:—|ведёт)\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)/u)?.[1]).filter((name): name is string => !!name))];
  const teacher = teacherNames.find(name => normalize(message).includes(normalize(name)) || /^(?:а\s+он|а\s+она|что\s+он|что\s+она)/u.test(q) && plan.teacher && normalize(name) === normalize(plan.teacher));
  const filtered = teacher ? facts.filter(fact => fact.text.includes(teacher)) : facts;
  const priorAnswer = plan.followUp ? normalize(history.at(-1)?.content ?? "") : "";
  const relevant = plan.topic === "TEACHERS" && /еще|друг/u.test(q) && priorAnswer
    ? filtered.filter(fact => !teacherNames.some(name => fact.text.includes(name) && priorAnswer.includes(normalize(name)))) : filtered;
  const bounded: Fact[] = []; let bytes = 0;
  for (const fact of relevant) { const size = Buffer.byteLength(fact.text); if (bytes + size > 11000) { complete = false; break; } bounded.push(fact); bytes += size; }
  if ((plan.topic === "WORKS" || plan.topic === "SCHEDULE") && relevant.length > 10) complete = false;
  if (!bounded.length) return { answer: { text: complete ? plan.topic === "SCHEDULE" ? /завтра/u.test(q) ? `На ${formatDay(addDays(learning.context.today, 1))} подтверждённых занятий нет.` : "На выбранную дату подтверждённых занятий нет." : plan.topic === "WORKS" && /приближа|ближайш|скоро/u.test(q) ? "На ближайшие семь дней работ с подтверждённым сроком не найдено." : plan.topic === "TEACHERS" && /еще|друг/u.test(q) ? "Других преподавателей в проверенном учебном контексте не найдено." : "В проверенных учебных данных по этому вопросу совпадений нет. Уточните формулировку, если имели в виду другую дисциплину." : "Не удалось проверить необходимые учебные сведения. Попробуйте позже.", providerMode: "DEMO_MOCK", completeness: complete ? "COMPLETE" : "UNKNOWN", targets: [] }, topic: plan.topic, sources, contextSent: false, modelUsed: provider ? process.env.GIGACHAT_MODEL ?? "GigaChat-2" : undefined, fallback: planFallback };
  let generated: { text: string; factIds: string[] } | undefined;
  if (provider) try { generated = await provider.answer(message, bounded.map(({ id, text }) => ({ id, text })), history); }
  catch (error) {
    if (!(error instanceof GigaChatError) || error.kind !== "INVALID_RESPONSE") throw error;
    planFallback = "GigaChat вернул некорректный ответ; показаны исходные записи.";
  }
  const knownResult = plan.topic === "RESULTS" && bounded.some(fact => /:\s*(?:0\s*балл|\d+|зачтено|хорошо|отлично)/iu.test(fact.text));
  const inaccurateAbsence = knownResult && generated && /(?:результат|оценк|балл)[^.!?]{0,80}(?:не\s+указан|нет|отсутств)/iu.test(generated.text);
  const inventedTeacher = plan.topic === "TEACHERS" && generated && (generated.text.match(/[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/gu) ?? []).some(name => !teacherNames.includes(name));
  const relevantTeachers = [...new Set(bounded.map(fact => fact.text.match(/(?:—|ведёт)\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)/u)?.[1]).filter((name): name is string => !!name))];
  const missingTeacher = plan.topic === "TEACHERS" && generated && relevantTeachers.some(name => !generated!.text.includes(name));
  const inaccurateTeacherAbsence = plan.topic === "TEACHERS" && generated && bounded.length > 0 && /(?:других|преподавател)[^.!?]{0,70}(?:нет|отсутств)|информация[^.!?]{0,70}отсутствует/iu.test(generated.text);
  const unsafeWorkClaim = plan.topic === "WORKS" && /что.*(?:нужно|остал)|не\s*выполн/u.test(q) && bounded.some(fact => /выполнение: не указано/u.test(fact.text));
  if (inaccurateAbsence || inventedTeacher || missingTeacher || inaccurateTeacherAbsence || unsafeWorkClaim) generated = undefined;
  const selectedFacts = generated?.factIds.length ? bounded.filter(fact => generated!.factIds.includes(fact.id)) : plan.topic === "TEACHERS" ? bounded : bounded.slice(0, 10);
  const seenTeachers = new Set<string>();
  const displayedFacts = plan.topic === "TEACHERS" ? selectedFacts.filter(fact => {
    const subjectMatch = fact.text.match(/^Дисциплина (.*?):|^По доступному расписанию дисциплины (.*?) занятие/u);
    const title = subjectMatch?.[1] ?? subjectMatch?.[2];
    const name = fact.text.match(/(?:—|ведёт)\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)/u)?.[1];
    if (!title || !name) return true;
    const key = `${title}|${name}`;
    if (seenTeachers.has(key)) return false;
    seenTeachers.add(key);
    return true;
  }) : selectedFacts;
  const text = generated?.factIds.length ? generated.text : `${unsafeWorkClaim ? "Источник не подтверждает, какие работы осталось выполнить. Доступные записи:\n" : ""}${displayedFacts.map(fact => `• ${fact.text}`).join("\n")}`;
  return { answer: { text, providerMode: generated?.factIds.length ? "GIGACHAT" : "DEMO_MOCK", completeness: complete ? "COMPLETE" : "PARTIAL", targets: [...new Map(selectedFacts.filter(fact => fact.target).map(fact => [JSON.stringify(fact.target), fact.target!])).values()].slice(0, 10), ...(!complete ? { notice: "Часть запрошенных учебных сведений недоступна или ограничена выборкой." } : {}) }, topic: plan.topic, sources, contextSent: !!provider, modelUsed: provider ? process.env.GIGACHAT_MODEL ?? "GigaChat-2" : undefined, fallback: planFallback ?? (provider && !generated?.factIds.length ? unsafeWorkClaim ? "Статусы не позволяют определить невыполненные работы; показаны исходные записи." : inaccurateAbsence ? "Модель неверно обобщила известный результат; показаны исходные записи." : inventedTeacher ? "Модель назвала неподтверждённого преподавателя; показаны исходные записи." : missingTeacher ? "Модель не перечислила всех преподавателей из проверенных источников; показаны исходные записи." : inaccurateTeacherAbsence ? "Модель ошибочно сообщила об отсутствии известных преподавателей; показаны исходные записи." : "Модель не указала проверяемые источники; показаны исходные записи." : undefined) };
}
