# Матрица проверок «ПУЛЬС»

Сверена с действующим документом 04 и OpenAPI при генерации. Столбец «Тесты» указывает проверяемые аспекты, но сам по себе не доказывает выполнение всех альтернатив и критериев приёмки. `pnpm test:coverage` измеряет только Vitest; Playwright в его проценты не входит.

Обозначения: **авто** — есть прямые автоматические проверки; **частично** — часть условий проверена, остаются перечисленные ниже пробелы; **вне MVP** — изменяющие действия ИИ запрещены; **ручная** — сценарий демонстрации жюри требует отдельного протокола.

## 77 функциональных требований

| ID | Требование | Сценарии | Тесты | Состояние |
|---|---|---|---|---|
| ФТ-01 | Вход студента в личный кабинет | СЦ-01 | [E1](e2e/auth.spec.ts), [I1](integration/auth.test.ts) | авто |
| ФТ-02 | Просмотр собственного профиля | СЦ-02, СЦ-15 | [E2](e2e/profile-resilience.spec.ts), [I1](integration/auth.test.ts) | авто |
| ФТ-03 | Краткая сводка занятий на главной | СЦ-03 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | частично |
| ФТ-04 | Краткая сводка учебных действий и подтверждённых сроков на главной | СЦ-03, СЦ-23 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | частично |
| ФТ-05 | Краткая сводка объявлений и событий на главной | СЦ-03, СЦ-10А | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | частично |
| ФТ-06 | Точка входа к материалам по дисциплинам на главной | СЦ-03, СЦ-12 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | частично |
| ФТ-07 | Единая точка входа в интеллектуальный чат | СЦ-03, СЦ-14 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | авто |
| ФТ-08 | Просмотр расписания на сегодня и неделю | СЦ-05, СЦ-20 | [E4](e2e/academic-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | авто |
| ФТ-09 | Учёт подгрупп отдельно по каждой дисциплине | СЦ-04, СЦ-05 | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-10 | Отражение изменений, переносов и отмен занятий | СЦ-05, СЦ-10А | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-11 | Обзор успеваемости и учебной деятельности за семестр | СЦ-06, СЦ-07, СЦ-19 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-12 | Поддержка различных способов учёта результатов и форм аттестации | СЦ-07, СЦ-19 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-13 | Заказ справки | СЦ-08 | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-14 | Подача заявления | СЦ-09 | [E5](e2e/student-api.spec.ts), [I4](integration/student-flows.test.ts) | частично |
| ФТ-15 | Отображение статуса внутри соответствующей заявки | СЦ-10 | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-16 | Просмотр общего календаря университета | СЦ-11, СЦ-23 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts), [I2](integration/academic-projections.test.ts) | авто |
| ФТ-17 | Просмотр уведомлений студента | СЦ-10А | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts), [U1](unit/academic-fixtures.test.ts) | авто |
| ФТ-18 | Уведомление об изменении расписания | СЦ-05, СЦ-10А | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts), [U1](unit/academic-fixtures.test.ts) | частично |
| ФТ-19 | Создание обращения в деканат | СЦ-13 | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-20 | Переписка внутри обращения | СЦ-13, СЦ-13А, СЦ-13Б | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-21 | Взаимодействие студента с ИИ-помощником | СЦ-14 | [E3](e2e/student-journeys.spec.ts), [I6](integration/assistant-context.test.ts) | авто |
| ФТ-22 | Получение доступного учебного материала | СЦ-12 | [E3](e2e/student-journeys.spec.ts), [U6](unit/learning-assets.test.ts) | авто |
| ФТ-23 | Сохранение пользовательских операций в настоящей базе данных | СЦ-08, СЦ-09, СЦ-13 | [I4](integration/student-flows.test.ts), [E5](e2e/student-api.spec.ts) | авто |
| ФТ-24 | Наличие собственного серверного API студенческого модуля | СЦ-01, СЦ-15 | [U3](unit/api-contract-inventory.test.ts), [E5](e2e/student-api.spec.ts) | авто |
| ФТ-25 | Изоляция данных и операций разных аккаунтов | СЦ-15 | [I3](integration/academic-operation-isolation.test.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-26 | Адаптивность основных пользовательских сценариев | СЦ-17 | [E1](e2e/auth.spec.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-27 | Единая главная сводка без дублирования самостоятельных разделов | СЦ-03, СЦ-23 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | авто |
| ФТ-28 | Автоматическое отображение официальной подгруппы в дисциплине | СЦ-04 | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts) | авто |
| ФТ-29 | Неизменность официального назначения при просмотре | СЦ-04, СЦ-15 | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts) | авто |
| ФТ-30 | Поддержка трёх и более подгрупп по одной дисциплине | СЦ-04 | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts) | авто |
| ФТ-31 | Обработка отсутствующего или противоречивого назначения на подгруппу | СЦ-04 | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts) | авто |
| ФТ-32 | Детализация результата по компонентам оценивания | СЦ-07 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-33 | Официальная форма аттестации и результаты сессии | СЦ-07 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-34 | Запрет неподтверждённых расчётов и универсального процента прогресса | СЦ-07, СЦ-19, СЦ-24 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | частично |
| ФТ-35 | Просмотр списка собственных заявок и запросов справок | СЦ-10 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-36 | Отображение формы для выбранного типа заявления или справки | СЦ-08, СЦ-09 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-37 | Проверка заполнения формы перед отправкой | СЦ-08, СЦ-09 | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-38 | Разделение локального сохранения заявки и её обработки внешней системой | СЦ-08, СЦ-09, СЦ-10 | [I4](integration/student-flows.test.ts), [I5](integration/delivery-recovery.test.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-39 | Защита от дублирования повторных операций | СЦ-08, СЦ-09, СЦ-13Б | [I4](integration/student-flows.test.ts), [I5](integration/delivery-recovery.test.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-40 | Отображение ошибок обработки заявок | СЦ-08, СЦ-09, СЦ-10 | [I4](integration/student-flows.test.ts), [I5](integration/delivery-recovery.test.ts), [E6](e2e/student-api-negative.spec.ts) | частично |
| ФТ-41 | Просмотр списка и подробностей собственных обращений | СЦ-13, СЦ-13А | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-42 | Сохранение и упорядоченное отображение сообщений обращения | СЦ-13А, СЦ-13Б | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-43 | Отображение ответных сообщений в переписке | СЦ-13А, СЦ-13Б | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | частично |
| ФТ-44 | Учёт области действия календарного события | СЦ-11 | [I2](integration/academic-projections.test.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-45 | Экспорт календаря в ICS | СЦ-11.1 | [U4](unit/calendar-export.test.ts), [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-46 | Экспорт календаря в PDF | СЦ-11.2 | [U4](unit/calendar-export.test.ts), [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-47 | Экспорт календаря в XLSX | СЦ-11.3 | [U4](unit/calendar-export.test.ts), [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-48 | Согласованность данных календаря во всех форматах экспорта | СЦ-11.1, СЦ-11.2, СЦ-11.3, СЦ-23 | [U4](unit/calendar-export.test.ts), [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-49 | Единый раздел уведомлений | СЦ-10А | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-50 | Индивидуальные состояния прочтения и действие «Прочитать всё» | СЦ-10А | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-51 | Переход от уведомления к исходному объекту | СЦ-10А | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | частично |
| ФТ-52 | Просмотр списка материалов по дисциплине | СЦ-12 | [U6](unit/learning-assets.test.ts), [E3](e2e/student-journeys.spec.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-53 | Отображение основных сведений об учебном материале | СЦ-12 | [U6](unit/learning-assets.test.ts), [E3](e2e/student-journeys.spec.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-54 | Обработка недоступного или отсутствующего учебного материала | СЦ-12, СЦ-16 | [U6](unit/learning-assets.test.ts), [E3](e2e/student-journeys.spec.ts), [E6](e2e/student-api-negative.spec.ts) | частично |
| ФТ-55 | Обработка пользовательского запроса и возврат ответа ИИ-помощника | СЦ-14 | [I6](integration/assistant-context.test.ts), [U5](unit/gigachat-adapter.test.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-56 | Каталог поддерживаемых тем и интентов ИИ-помощника | СЦ-14 | [I6](integration/assistant-context.test.ts), [U5](unit/gigachat-adapter.test.ts), [E3](e2e/student-journeys.spec.ts) | частично |
| ФТ-57 | Использование персонального учебного контекста текущего студента | СЦ-14, СЦ-15 | [I6](integration/assistant-context.test.ts), [U5](unit/gigachat-adapter.test.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-58 | Достоверность и обозначение неопределённости ответа ИИ | СЦ-14 | [I6](integration/assistant-context.test.ts), [U5](unit/gigachat-adapter.test.ts), [E3](e2e/student-journeys.spec.ts) | частично |
| ФТ-59 | Выполнение изменяющих действий ИИ только через разрешённые серверные операции | СЦ-14А (**вне объёма**; запрет изменяющих действий) | [I4](integration/student-flows.test.ts), [I6](integration/assistant-context.test.ts) | вне MVP |
| ФТ-60 | Обработка неподдерживаемых запросов и ошибок ИИ-помощника | СЦ-14 | [I6](integration/assistant-context.test.ts), [U5](unit/gigachat-adapter.test.ts) | авто |
| ФТ-61 | Временное хранение и восстановление текущего диалога на стороне клиента | СЦ-14 (постоянная серверная история не ведётся) | [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-62 | Выполнение бизнес-правил на серверной стороне | СЦ-08, СЦ-09, СЦ-13, СЦ-13Б | [I4](integration/student-flows.test.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| ФТ-63 | Запрет прямого обращения браузерного клиента к мокам внешних систем | СЦ-01, СЦ-15 | [U3](unit/api-contract-inventory.test.ts), [E5](e2e/student-api.spec.ts) | частично |
| ФТ-64 | Использование тестовых API/моков вместо реальных университетских систем | СЦ-03, СЦ-16 | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts) | авто |
| ФТ-65 | Разделение внешних учебных сведений и собственных пользовательских операций | СЦ-08, СЦ-09, СЦ-10 | [I2](integration/academic-projections.test.ts), [I4](integration/student-flows.test.ts) | авто |
| ФТ-66 | Корректная обработка частичной недоступности внешних источников | СЦ-16 | [I2](integration/academic-projections.test.ts), [I5](integration/delivery-recovery.test.ts) | частично |
| ФТ-67 | Семестровый контекст дисциплины и её страница | СЦ-06, СЦ-07, СЦ-19 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-68 | Разнородный состав учебной деятельности без жёсткого шаблона | СЦ-07, СЦ-19 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-69 | Учебные занятия и подтверждённая посещаемость | СЦ-05, СЦ-20 | [U1](unit/academic-fixtures.test.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| ФТ-70 | Выданные учебные задания, обязательства и состояния выполнения | СЦ-07, СЦ-21 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-71 | Длительные работы и подтверждённые этапы | СЦ-07, СЦ-22 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| ФТ-72 | Разграничение задания, учебного материала и результата и подтверждённые связи | СЦ-12, СЦ-21 | [U6](unit/learning-assets.test.ts), [E3](e2e/student-journeys.spec.ts) | частично |
| ФТ-73 | Хронология учебных событий с сохранением смысла даты | СЦ-07, СЦ-23 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | частично |
| ФТ-74 | Три независимых измерения учебного прогресса | СЦ-07, СЦ-19, СЦ-20, СЦ-21 | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | частично |
| ФТ-75 | Единая проекция учебных сроков для главной, дисциплины, календаря и экспорта | СЦ-03, СЦ-11, СЦ-23 | [I2](integration/academic-projections.test.ts), [U4](unit/calendar-export.test.ts), [E3](e2e/student-journeys.spec.ts) | частично |
| ФТ-76 | Достоверное отображение неполных и недоступных учебных сведений | СЦ-16, СЦ-24 | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts), [I6](integration/assistant-context.test.ts) | частично |
| ФТ-77 | Только просмотр официальной академической информации студентом | СЦ-15, СЦ-24 | [I3](integration/academic-operation-isolation.test.ts), [E6](e2e/student-api-negative.spec.ts) | авто |

## 31 пользовательский сценарий

| ID | Сценарий | Тесты | Состояние |
|---|---|---|---|
| СЦ-01 | Вход студента в личный кабинет | [E1](e2e/auth.spec.ts), [I1](integration/auth.test.ts) | авто |
| СЦ-02 | Просмотр собственного профиля | [E2](e2e/profile-resilience.spec.ts), [I1](integration/auth.test.ts) | авто |
| СЦ-03 | Главная страница — персональная сводка | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | частично |
| СЦ-04 | Автоматическое определение официальной подгруппы | [U1](unit/academic-fixtures.test.ts), [I2](integration/academic-projections.test.ts) | авто |
| СЦ-05 | Просмотр расписания и изменений | [E4](e2e/academic-journeys.spec.ts), [I2](integration/academic-projections.test.ts) | авто |
| СЦ-06 | Обзор учебной деятельности и успеваемости за семестр | [E4](e2e/academic-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | авто |
| СЦ-07 | Страница дисциплины: деятельность, результаты и аттестация | [E4](e2e/academic-journeys.spec.ts), [I2](integration/academic-projections.test.ts) | авто |
| СЦ-08 | Заказ справки | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| СЦ-09 | Подача заявления | [E5](e2e/student-api.spec.ts), [I4](integration/student-flows.test.ts) | частично |
| СЦ-10 | Просмотр собственных заявок и их статусов | [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| СЦ-10А | Единый центр уведомлений и управление прочтением | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| СЦ-11 | Общий календарь университета и проекция учебных сроков | [E3](e2e/student-journeys.spec.ts), [I2](integration/academic-projections.test.ts) | авто |
| СЦ-11.1 | Экспорт календаря в ICS | [U4](unit/calendar-export.test.ts), [E3](e2e/student-journeys.spec.ts), [E5](e2e/student-api.spec.ts) | авто |
| СЦ-11.2 | Экспорт календаря в PDF | [U4](unit/calendar-export.test.ts), [E5](e2e/student-api.spec.ts) | частично |
| СЦ-11.3 | Экспорт календаря в XLSX | [U4](unit/calendar-export.test.ts), [E5](e2e/student-api.spec.ts) | частично |
| СЦ-12 | Учебные материалы по дисциплине, занятию и работе | [U6](unit/learning-assets.test.ts), [E3](e2e/student-journeys.spec.ts), [E6](e2e/student-api-negative.spec.ts) | частично |
| СЦ-13 | Создание обращения в деканат | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| СЦ-13А | Просмотр истории переписки внутри обращения | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| СЦ-13Б | Отправка сообщения в существующем обращении | [E3](e2e/student-journeys.spec.ts), [I4](integration/student-flows.test.ts) | авто |
| СЦ-14 | Взаимодействие с ИИ-помощником | [E3](e2e/student-journeys.spec.ts), [I6](integration/assistant-context.test.ts) | авто |
| СЦ-14А | Выполнение действия через ИИ-помощника | [I4](integration/student-flows.test.ts), [I6](integration/assistant-context.test.ts) | вне MVP |
| СЦ-15 | Сквозная проверка изоляции двух тестовых аккаунтов | [I3](integration/academic-operation-isolation.test.ts), [E6](e2e/student-api-negative.spec.ts) | авто |
| СЦ-16 | Ошибки и частичная недоступность внешних источников | [I2](integration/academic-projections.test.ts), [I5](integration/delivery-recovery.test.ts), [I6](integration/assistant-context.test.ts), [E2](e2e/profile-resilience.spec.ts) | частично |
| СЦ-17 | Мобильное прохождение основных сценариев от 360 px | [E1](e2e/auth.spec.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| СЦ-18 | Демонстрация прототипа жюри | [E1](e2e/auth.spec.ts), [E3](e2e/student-journeys.spec.ts), [E4](e2e/academic-journeys.spec.ts) | ручная |
| СЦ-19 | Одна модель — разные дисциплины и учебные периоды | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| СЦ-20 | Занятия, проведение и персональная посещаемость | [U1](unit/academic-fixtures.test.ts), [E3](e2e/student-journeys.spec.ts) | авто |
| СЦ-21 | Выданная работа, известное выполнение и связанные материалы | [U6](unit/learning-assets.test.ts), [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| СЦ-22 | Курсовой проект и его подтверждённые этапы | [I2](integration/academic-projections.test.ts), [E4](e2e/academic-journeys.spec.ts) | авто |
| СЦ-23 | Хронология дат и единая проекция сроков | [I2](integration/academic-projections.test.ts), [U4](unit/calendar-export.test.ts), [E4](e2e/academic-journeys.spec.ts) | частично |
| СЦ-24 | Неполная информация и запрет изменения официальных данных | [I2](integration/academic-projections.test.ts), [I3](integration/academic-operation-isolation.test.ts), [E6](e2e/student-api-negative.spec.ts) | частично |

## 49 операций собственного API

Все операции проверяются статическим инвентарём OpenAPI ↔ Route Handlers (`U3`). Приведённый E2E-тест вызывает соответствующий HTTP-маршрут; матрица не означает проверки всех ошибок каждой операции.

| Метод и путь | operationId | Тесты |
|---|---|---|
| `POST /auth/login` | `loginStudent` | [E1](e2e/auth.spec.ts), [I1](integration/auth.test.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /auth/logout` | `logoutStudent` | [E1](e2e/auth.spec.ts), [I1](integration/auth.test.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /auth/me` | `getSession` | [E1](e2e/auth.spec.ts), [I1](integration/auth.test.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /profile` | `getMyProfile` | [E2](e2e/profile-resilience.spec.ts), [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /dashboard` | `getDashboard` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods` | `listPeriods` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings` | `listOfferings` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/academic-units` | `listAcademicUnits` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/academic-units/{unitId}` | `getAcademicUnit` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /schedule` | `getSchedule` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /schedule/{scheduleId}` | `getScheduleEntry` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings/{offeringId}` | `getOfferingDetail` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings/{offeringId}/sessions` | `listOfferingSessions` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings/{offeringId}/works` | `listOfferingWorks` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings/{offeringId}/works/{workId}` | `getOfferingWork` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings/{offeringId}/timeline` | `getOfferingTimeline` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings/{offeringId}/results` | `getOfferingResults` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/offerings/{offeringId}/attestations` | `listOfferingAttestations` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /academic/search` | `searchMyAcademics` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /materials` | `listMyMaterials` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /materials/{id}` | `getMaterial` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /materials/{id}/download` | `downloadMaterial` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `HEAD /materials/{id}/download` | `headMaterial` | [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /requests/types` | `listRequestTypes` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /requests/types/{requestTypeCode}` | `getRequestType` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /requests` | `listRequests` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /requests` | `createRequest` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /requests/{id}` | `getRequestDetail` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /requests/{id}/status` | `getRequestStatus` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /appeals` | `listAppeals` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /appeals` | `createAppeal` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /appeals/{id}` | `getAppealDetail` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /appeals/{id}/messages` | `listAppealMessages` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /appeals/{id}/messages` | `sendAppealMessage` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /notifications` | `listNotifications` | [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /notifications/{notificationKey}` | `getNotification` | [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /notifications/read` | `markNotificationsRead` | [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /notifications/read-all` | `markAllNotificationsRead` | [E5](e2e/student-api.spec.ts), [E3](e2e/student-journeys.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /announcements` | `listAnnouncements` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /announcements/{announcementId}` | `getAnnouncement` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /calendar` | `getCalendar` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /calendar/events/{eventKey}` | `getCalendarEvent` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /calendar/export-preview` | `previewCalendarExport` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /calendar/export` | `exportCalendar` | [E5](e2e/student-api.spec.ts), [E6](e2e/student-api-negative.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /operations/resolve` | `resolveOwnOperation` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `POST /assistant/ask` | `askAssistant` | [E5](e2e/student-api.spec.ts), [I6](integration/assistant-context.test.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/academic-units/{unitId}/works/{workId}` | `getIndependentUnitWork` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/academic-units/{unitId}/works` | `listIndependentUnitWorks` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |
| `GET /periods/{periodId}/academic-units/{unitId}/timeline` | `getIndependentUnitTimeline` | [E5](e2e/student-api.spec.ts), [U3](unit/api-contract-inventory.test.ts) |

## Подтверждённые пределы матрицы

- Актуальные проценты Vitest V8 находятся в `coverage/vitest/coverage-summary.json` после `pnpm test:coverage`. В расчёт входят `src`, `scripts`, `prisma` и неимпортированные файлы. Playwright не входит в этот отчёт, поэтому ноль у React-экрана или Route Handler не означает отсутствия E2E-проверки.
- Для частичных строк нужны адресные проверки: полные составы карточек главной; UI заявления в отличие от справки; переход каждого уведомления к исходному объекту; все варианты ошибок и неполных данных в браузере; связанные материалы и даты в нескольких представлениях; перенос срока одновременно в главной, дисциплине, календаре и трёх файлах экспорта.
- Реальный GigaChat, production-инфраструктура и демонстрация жюри не подтверждаются локальными автотестами. Репетиция развёртывания проводится отдельно.
