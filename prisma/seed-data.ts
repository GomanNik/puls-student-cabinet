// Только вымышленные профили. Импортируется исключительно операторским seed и тестами.
export const demoStudents = [
  { login: "demo-a", fullName: "Дёмина Александра Ильинична", faculty: "Факультет цифровых технологий", studyProgram: "Прикладная информатика", course: 2, group: "ПИ-24-1", externalStudentId: "fixture-student-a" },
  { login: "demo-b", fullName: "Лазарев Михаил Артёмович", faculty: "Факультет социально-гуманитарных наук", studyProgram: "История и культурное наследие", course: 3, group: "ИК-23-2", externalStudentId: "fixture-student-b" },
] as const;
