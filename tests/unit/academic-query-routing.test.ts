import { describe, expect, it } from "vitest";
import { inferAcademicTopic } from "@/modules/assistant/academic-query";

describe("локальная маршрутизация академических продолжений", () => {
  const teacherHistory: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: "Какие преподаватели ведут занятия у моей группы?" },
    { role: "assistant", content: "История России — Светлов Павел Андреевич. Практические занятия — Зорина Татьяна Викторовна." },
  ];

  it.each([
    "Какие ещё есть преподаватели?",
    "А какие ещё преподаватели есть?",
    "Кто ещё?",
    "Кто из них?",
    "Кто из них ведёт историю России?",
  ])("не отправляет продолжение «%s» в GENERAL", question => {
    expect(inferAcademicTopic(question, teacherHistory)).toBe("TEACHERS");
  });

  it.each([
    "А у него какие предметы?",
    "А какие у него предметы?",
    "А какие предметы у него?",
    "А у неё какие дисциплины?",
    "А она какие предметы ведёт?",
  ])("распознаёт местоименную ссылку на преподавателя: %s", question => {
    expect(inferAcademicTopic(question, [
      { role: "user", content: "Кто ведёт практические занятия?" },
      { role: "assistant", content: "Практические занятия ведёт Зорина Татьяна Викторовна." },
    ])).toBe("TEACHERS");
  });

  it("распознаёт вопрос о преподавателе, даже если его ФИО набрано строчными буквами", () => {
    expect(inferAcademicTopic("какие предметы ведет светлова павла андреевича?", [])).toBe("TEACHERS");
  });

  it("не меняет маршруты обычных вопросов о занятиях и работах", () => {
    expect(inferAcademicTopic("Какие занятия у меня завтра?", [])).toBe("SCHEDULE");
    expect(inferAcademicTopic("Какие работы нужно выполнить?", [])).toBe("WORKS");
    expect(inferAcademicTopic("Какие у меня результаты за семестр?", [])).toBe("RESULTS");
  });
});
