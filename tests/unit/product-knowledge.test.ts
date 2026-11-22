import { describe, expect, it } from "vitest";
import { answerProductQuestion, classifyProductHelp } from "@/modules/assistant/product-knowledge";

describe("база знаний продукта ПУЛЬС", () => {
  it("объясняет назначение продукта и перечисляет только его студенческие разделы", () => {
    const answer = answerProductQuestion("Что такое ПУЛЬС?");
    expect(answer?.topic).toBe("OVERVIEW");
    expect(answer?.answer.text).toContain("конкурсный прототип");
    expect(answer?.answer.text).toContain("не официальный сервис университета");
    expect(answer?.answer.providerMode).toBe("DEMO_MOCK");
    expect(answer?.answer.notice).toContain("База знаний ПУЛЬС");
  });

  it.each([
    ["Где посмотреть расписание?", "SCHEDULE", "личное расписание"],
    ["Где найти учебные материалы?", "MATERIALS", "раздел «Материалы»"],
    ["Как скачать учебный материал?", "MATERIALS", "просмотр или скачивание"],
    ["Где посмотреть сроки выполнения работ?", "WORKS", "к блоку «Работы»"],
    ["Как посмотреть оценки?", "GRADES", "разделе «Учёба»"],
    ["Где посмотреть преподавателя?", "TEACHERS", "не полный справочник"],
    ["Как узнать статус заявления?", "REQUESTS", "«Заявления и справки»"],
    ["Где посмотреть переписку с деканатом?", "APPEALS", "«Обращения»"],
    ["Как экспортировать календарь?", "CALENDAR", "ICS, PDF и XLSX"],
  ] as const)("даёт инструкцию по запросу %s", (question, topic, expected) => {
    const answer = answerProductQuestion(question);
    expect(answer?.topic).toBe(topic);
    expect(answer?.answer.text).toContain(expected);
  });

  it("объясняет, как пользоваться самим помощником", () => {
    const answer = answerProductQuestion("Что умеет помощник?");
    expect(answer?.topic).toBe("ASSISTANT");
    expect(answer?.answer.text).toContain("Shift+Enter");
    expect(answer?.answer.text).toContain("Не отправляйте в чат пароли");
    expect(answerProductQuestion("Как пользоваться помощником?")?.topic).toBe("ASSISTANT");
  });

  it("объясняет границы прав и отсутствие реальных интеграций", () => {
    expect(answerProductQuestion("Можно ли изменить оценку?")?.answer.text).toContain("не редактирует оценки");
    expect(answerProductQuestion("Можно ли самостоятельно выбрать подгруппу?")?.answer.text).toContain("официальное назначение на подгруппу");
    expect(answerProductQuestion("Можно ли сдавать работу?")?.answer.text).toContain("загрузка и сдача работ на проверку");
    expect(answerProductQuestion("Как сменить преподавателя?")?.answer.text).toContain("сведения о преподавателях");
    expect(answerProductQuestion("Есть ли кабинет преподавателя?")?.answer.text).toContain("не входят в проект");
    expect(answerProductQuestion("ПУЛЬС подключен к реальным системам университета?")?.answer.text).toContain("не подключается к реальным университетским системам");
  });

  it("разрешает короткое продолжение по предыдущему вопросу о разделе", () => {
    const topic = classifyProductHelp("А как туда перейти?", [
      { role: "user", content: "Где посмотреть расписание?" },
      { role: "assistant", content: "Откройте раздел «Расписание»." },
    ]);
    expect(topic).toBe("SCHEDULE");
  });

  it("не перехватывает вопросы о фактическом содержимом учебных данных", () => {
    expect(answerProductQuestion("Кто ведёт историю России?")).toBeNull();
    expect(answerProductQuestion("Какие занятия у меня завтра?")).toBeNull();
    expect(answerProductQuestion("Какие ещё преподаватели есть?")).toBeNull();
    expect(answerProductQuestion("Какие функции у преподавателя?")).toBeNull();
    expect(answerProductQuestion("С чего начать изучать математику?")).toBeNull();
  });
});
