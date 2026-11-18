// Сгенерировано scripts/generate-contracts.mjs. Источник: документация/API/Контракт_студенческого_API.yaml
import { z } from "zod";

export const ErrorDetailSchema = z.strictObject({"field":z.string().max(160),"issue":z.string().max(240)});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ErrorObjectSchema = z.strictObject({"code":z.union([z.literal("BAD_REQUEST"),z.literal("VALIDATION_ERROR"),z.literal("AUTH_REQUIRED"),z.literal("INVALID_CREDENTIALS"),z.literal("SESSION_EXPIRED"),z.literal("CSRF_ORIGIN_INVALID"),z.literal("ACCESS_FORBIDDEN"),z.literal("NOT_FOUND"),z.literal("FORM_SCHEMA_CHANGED"),z.literal("IDEMPOTENCY_CONFLICT"),z.literal("SOURCE_REVISION_CHANGED"),z.literal("SCOPE_CONFLICT"),z.literal("CALENDAR_SELECTION_EMPTY"),z.literal("CALENDAR_SELECTION_CHANGED"),z.literal("SOURCE_INCOMPLETE"),z.literal("EXTERNAL_INVALID_RESPONSE"),z.literal("EXTERNAL_UNAVAILABLE"),z.literal("EXTERNAL_TIMEOUT"),z.literal("RATE_LIMITED"),z.literal("PAYLOAD_TOO_LARGE"),z.literal("UNSUPPORTED_MEDIA_TYPE"),z.literal("OPERATION_UNRESOLVED"),z.literal("MATERIAL_UNAVAILABLE"),z.literal("INTERNAL_ERROR"),z.literal("RANGE_NOT_SUPPORTED")]),"message":z.string().min(1).max(300),"details":z.array(ErrorDetailSchema).max(30).optional()});
export type ErrorObject = z.infer<typeof ErrorObjectSchema>;

export const ErrorMetaSchema = z.strictObject({"requestId":z.string().min(1).max(240)});
export type ErrorMeta = z.infer<typeof ErrorMetaSchema>;

export const ErrorResponseSchema = z.strictObject({"error":ErrorObjectSchema,"meta":ErrorMetaSchema});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PartialErrorSchema = z.strictObject({"dataset":z.union([z.literal("CONTEXT"),z.literal("SCHEDULE"),z.literal("ACTUAL"),z.literal("ATTENDANCE"),z.literal("WORK"),z.literal("STAGE"),z.literal("ASSESSMENT"),z.literal("ATTESTATION"),z.literal("MATERIAL"),z.literal("ANNOUNCEMENT"),z.literal("CALENDAR"),z.literal("DEADLINE"),z.literal("REQUEST"),z.literal("APPEAL"),z.literal("AI"),z.literal("NOTIFICATION")]),"code":z.union([z.literal("SOURCE_UNAVAILABLE"),z.literal("SOURCE_INCOMPLETE"),z.literal("SOURCE_INVALID"),z.literal("SOURCE_TIMEOUT"),z.literal("SCOPE_CONFLICT"),z.literal("SOURCE_REVISION_CHANGED")])});
export type PartialError = z.infer<typeof PartialErrorSchema>;

export const ResponseMetaSchema = z.strictObject({"requestId":z.string().min(1).max(240),"sourceStatus":z.union([z.literal("READY"),z.literal("PARTIAL"),z.literal("SOURCE_ERROR")]).optional(),"completeness":z.union([z.boolean(),z.null()]).optional(),"completenessByDataset":z.strictObject({"schedule":z.union([z.boolean(),z.null()]).optional(),"actual":z.union([z.boolean(),z.null()]).optional(),"attendance":z.union([z.boolean(),z.null()]).optional(),"work":z.union([z.boolean(),z.null()]).optional(),"stage":z.union([z.boolean(),z.null()]).optional(),"assessment":z.union([z.boolean(),z.null()]).optional(),"attestation":z.union([z.boolean(),z.null()]).optional(),"material":z.union([z.boolean(),z.null()]).optional(),"context":z.union([z.boolean(),z.null()]).optional(),"announcements":z.union([z.boolean(),z.null()]).optional(),"calendar":z.union([z.boolean(),z.null()]).optional(),"deadlines":z.union([z.boolean(),z.null()]).optional()}).optional(),"completenessByCategory":z.strictObject({"ANNOUNCEMENT":z.union([z.boolean(),z.null()]).optional(),"ACADEMIC_DEADLINE":z.union([z.boolean(),z.null()]).optional(),"SCHEDULE_CHANGE":z.union([z.boolean(),z.null()]).optional(),"APPEAL_REPLY":z.union([z.boolean(),z.null()]).optional(),"REQUEST_STATUS":z.union([z.boolean(),z.null()]).optional()}).optional(),"fetchedAt":z.string().datetime({offset:true}).optional(),"sourceUpdatedAt":z.string().datetime({offset:true}).optional(),"partialErrors":z.array(PartialErrorSchema).max(30).optional()});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export const DataStateSchema = z.union([z.literal("UNKNOWN"),z.literal("NOT_APPLICABLE"),z.literal("PENDING"),z.literal("KNOWN_ZERO"),z.literal("SOURCE_ERROR"),z.literal("FORBIDDEN"),z.literal("READY"),z.literal("EMPTY_CONFIRMED")]);
export type DataState = z.infer<typeof DataStateSchema>;

export const SourceStateSchema = z.union([z.literal("READY"),z.literal("PARTIAL"),z.literal("SOURCE_ERROR")]);
export type SourceState = z.infer<typeof SourceStateSchema>;

export const IdentifierSchema = z.string().min(1).max(240);
export type Identifier = z.infer<typeof IdentifierSchema>;

export const DatePrecisionSchema = z.union([z.literal("DATE_ONLY"),z.literal("DATE_TIME")]);
export type DatePrecision = z.infer<typeof DatePrecisionSchema>;

export const AcademicDateSchema = z.strictObject({"precision":z.union([z.literal("DATE_ONLY"),z.literal("DATE_TIME")]),"on":z.string().date().optional(),"at":z.string().datetime({offset:true}).optional(),"timeZone":z.string().max(100).optional()}).refine(value => [z.looseObject({"precision":z.literal("DATE_ONLY")}).refine(value => ["on"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").refine(value => !z.union([z.looseObject({}).refine(value => ["at"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле"),z.looseObject({}).refine(value => ["timeZone"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле")]).safeParse(value).success),z.looseObject({"precision":z.literal("DATE_TIME")}).refine(value => ["at","timeZone"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").refine(value => !z.looseObject({}).refine(value => ["on"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").safeParse(value).success)].filter(schema => schema.safeParse(value).success).length === 1, "Нарушен вариант DTO");
export type AcademicDate = z.infer<typeof AcademicDateSchema>;

export const TargetSchema = z.strictObject({"kind":z.union([z.literal("OFFERING"),z.literal("WORK"),z.literal("UNIT"),z.literal("SCHEDULE"),z.literal("REQUEST"),z.literal("APPEAL"),z.literal("ANNOUNCEMENT"),z.literal("MATERIAL"),z.literal("CALENDAR_EVENT"),z.literal("ATTESTATION")]),"targetRef":z.string().min(1).max(240)});
export type Target = z.infer<typeof TargetSchema>;

export const ListStatusSchema = z.strictObject({"dataState":DataStateSchema,"isComplete":z.union([z.boolean(),z.null()]),"nextCursor":z.union([z.string(),z.null()])});
export type ListStatus = z.infer<typeof ListStatusSchema>;

export const AcademicPeriodSchema = z.strictObject({"periodId":z.string().min(1).max(240),"label":z.string().min(1),"isCurrent":z.boolean(),"startsOn":z.string().date().optional(),"endsOn":z.string().date().optional()});
export type AcademicPeriod = z.infer<typeof AcademicPeriodSchema>;

export const SubgroupAssignmentSchema = z.strictObject({"dataState":DataStateSchema,"subgroupId":z.string().min(1).max(240).optional(),"label":z.string().max(180).optional(),"appliesToOfferingId":z.string().min(1).max(240).optional()});
export type SubgroupAssignment = z.infer<typeof SubgroupAssignmentSchema>;

export const OfferingSummarySchema = z.strictObject({"kind":z.literal("OFFERING"),"offeringId":z.string().min(1).max(240),"periodId":z.string().min(1).max(240),"title":z.string().min(1),"teacherLabel":z.string().min(1).optional(),"attestationLabel":z.string().optional(),"subgroup":SubgroupAssignmentSchema,"target":TargetSchema});
export type OfferingSummary = z.infer<typeof OfferingSummarySchema>;

export const IndependentUnitSummarySchema = z.strictObject({"kind":z.literal("INDEPENDENT_UNIT"),"unitId":z.string().min(1).max(240),"periodId":z.string().min(1).max(240),"title":z.string().min(1),"unitTypeLabel":z.string().optional(),"target":TargetSchema});
export type IndependentUnitSummary = z.infer<typeof IndependentUnitSummarySchema>;

export const StudyMemberSchema = z.strictObject({"kind":z.union([z.literal("OFFERING"),z.literal("INDEPENDENT_UNIT")]),"offering":OfferingSummarySchema.optional(),"unit":IndependentUnitSummarySchema.optional()}).refine(value => [z.looseObject({"kind":z.literal("OFFERING").optional()}).refine(value => ["offering"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле"),z.looseObject({"kind":z.literal("INDEPENDENT_UNIT").optional()}).refine(value => ["unit"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле")].filter(schema => schema.safeParse(value).success).length === 1, "Нарушен вариант DTO");
export type StudyMember = z.infer<typeof StudyMemberSchema>;

export const SessionAccountSchema = z.strictObject({"displayName":z.string(),"expiresAt":z.string().datetime({offset:true}),"absoluteExpiresAt":z.string().datetime({offset:true})});
export type SessionAccount = z.infer<typeof SessionAccountSchema>;

export const ProfileSchema = z.strictObject({"fullName":z.union([z.string().min(1),z.null()]),"faculty":z.union([z.string().min(1),z.null()]),"studyProgram":z.union([z.string().min(1),z.null()]),"course":z.union([z.number().int().min(1),z.null()]),"group":z.union([z.string().min(1),z.null()]),"academicLevel":z.string().optional()});
export type Profile = z.infer<typeof ProfileSchema>;

export const ScheduleChangeSchema = z.strictObject({"changeKey":z.string().min(1).max(240),"changeKind":z.union([z.literal("RESCHEDULED"),z.literal("CANCELLED"),z.literal("UPDATED")]),"description":z.string().optional(),"occurredAt":z.string().datetime({offset:true}).optional(),"revision":z.string().optional()});
export type ScheduleChange = z.infer<typeof ScheduleChangeSchema>;

export const ScheduleEntrySchema = z.strictObject({"scheduleId":z.string().min(1).max(240),"periodId":z.string().min(1).max(240),"offeringId":z.string().min(1).max(240),"title":z.string().min(1),"lessonType":z.string().optional(),"plannedStart":z.string().datetime({offset:true}).optional(),"plannedEnd":z.string().datetime({offset:true}).optional(),"timeZone":z.string().optional(),"room":z.string().optional(),"teacherLabel":z.string().optional(),"status":z.union([z.literal("PLANNED"),z.literal("RESCHEDULED"),z.literal("CANCELLED")]),"change":ScheduleChangeSchema.optional(),"subgroupLabel":z.string().optional(),"target":TargetSchema});
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

export const ActualSessionSchema = z.strictObject({"sessionId":z.string().min(1).max(240),"scheduleId":z.string().min(1).max(240),"held":z.boolean(),"heldOn":z.string().date().optional(),"heldAt":z.string().datetime({offset:true}).optional(),"topic":z.string().optional()});
export type ActualSession = z.infer<typeof ActualSessionSchema>;

export const AttendanceSchema = z.strictObject({"attendanceId":z.string().min(1).max(240),"actualSessionId":z.string().min(1).max(240),"status":z.union([z.literal("PRESENT"),z.literal("ABSENT"),z.literal("OTHER_RECORDED")]),"statusLabel":z.string().min(1),"recordedAt":z.string().datetime({offset:true}).optional()});
export type Attendance = z.infer<typeof AttendanceSchema>;

export const ScheduleDetailSchema = z.strictObject({"schedule":ScheduleEntrySchema,"actual":ActualSessionSchema.optional(),"actualState":DataStateSchema,"attendance":AttendanceSchema.optional(),"attendanceState":DataStateSchema});
export type ScheduleDetail = z.infer<typeof ScheduleDetailSchema>;

export const WorkProgressSchema = z.strictObject({"dataState":DataStateSchema,"assignmentStatusCode":z.string().optional(),"completionStatusCode":z.string().optional(),"submissionStatusCode":z.string().optional(),"reviewStatusCode":z.string().optional(),"completedAt":z.string().datetime({offset:true}).optional(),"submittedAt":z.string().datetime({offset:true}).optional(),"reviewedAt":z.string().datetime({offset:true}).optional()});
export type WorkProgress = z.infer<typeof WorkProgressSchema>;

export const StageSchema = z.strictObject({"stageId":z.string().min(1).max(240),"title":z.string().min(1),"description":z.string().optional(),"displayOrder":z.number().int().min(0).optional(),"due":AcademicDateSchema.optional(),"progress":WorkProgressSchema.optional()});
export type Stage = z.infer<typeof StageSchema>;

export const AssessmentValueSchema = z.strictObject({"kind":z.union([z.literal("NUMERIC"),z.literal("TEXT"),z.literal("CODE")]),"numeric":z.string().regex(new RegExp("^-?\\d+(?:\\.\\d+)?$")).optional(),"text":z.string().optional(),"code":z.string().optional(),"rawValueText":z.string().optional()}).refine(value => [z.looseObject({"kind":z.literal("NUMERIC")}).refine(value => ["numeric"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").refine(value => !z.union([z.looseObject({}).refine(value => ["text"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле"),z.looseObject({}).refine(value => ["code"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле")]).safeParse(value).success),z.looseObject({"kind":z.literal("TEXT")}).refine(value => ["text"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").refine(value => !z.union([z.looseObject({}).refine(value => ["numeric"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле"),z.looseObject({}).refine(value => ["code"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле")]).safeParse(value).success),z.looseObject({"kind":z.literal("CODE")}).refine(value => ["code"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").refine(value => !z.union([z.looseObject({}).refine(value => ["numeric"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле"),z.looseObject({}).refine(value => ["text"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле")]).safeParse(value).success)].filter(schema => schema.safeParse(value).success).length === 1, "Нарушен вариант DTO");
export type AssessmentValue = z.infer<typeof AssessmentValueSchema>;

export const WorkResultSchema = z.strictObject({"resultId":z.string().min(1).max(240),"stageId":z.string().min(1).max(240).optional(),"value":AssessmentValueSchema,"assessedAt":z.string().datetime({offset:true}).optional(),"label":z.string().optional()});
export type WorkResult = z.infer<typeof WorkResultSchema>;

export const WorkSummarySchema = z.strictObject({"workId":z.string().min(1).max(240),"periodId":z.string().min(1).max(240),"offeringId":z.string().min(1).max(240).optional(),"unitId":z.string().min(1).max(240).optional(),"title":z.string().min(1),"workTypeLabel":z.string().min(1),"issued":AcademicDateSchema.optional(),"due":AcademicDateSchema.optional(),"progress":WorkProgressSchema.optional(),"target":TargetSchema}).refine(value => [z.looseObject({}).refine(value => ["offeringId"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").refine(value => !z.looseObject({}).refine(value => ["unitId"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").safeParse(value).success),z.looseObject({}).refine(value => ["unitId"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").refine(value => !z.looseObject({}).refine(value => ["offeringId"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").safeParse(value).success)].filter(schema => schema.safeParse(value).success).length === 1, "Нарушен вариант DTO");
export type WorkSummary = z.infer<typeof WorkSummarySchema>;

export const MaterialSchema = z.strictObject({"materialId":z.string().min(1).max(240),"title":z.string().min(1),"kind":z.union([z.literal("FILE"),z.literal("LINK")]),"mimeType":z.string().optional(),"sizeBytes":z.number().int().min(0).optional(),"offeringId":z.string().min(1).max(240).optional(),"unitId":z.string().min(1).max(240).optional(),"relatedWorkIds":z.array(z.string().min(1).max(240)).optional(),"relatedScheduleIds":z.array(z.string().min(1).max(240)).optional(),"safeExternalUrl":z.string().regex(new RegExp("^https://")).url().optional(),"downloadTarget":TargetSchema.optional()}).refine(value => z.unknown().refine(value => !z.looseObject({"kind":z.literal("FILE")}).safeParse(value).success || z.unknown().refine(value => !z.looseObject({}).refine(value => ["safeExternalUrl"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").safeParse(value).success).safeParse(value).success, "Нарушено условие DTO").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => !z.looseObject({"kind":z.literal("LINK")}).safeParse(value).success || z.unknown().refine(value => !z.looseObject({}).refine(value => ["downloadTarget"].every(key => Object.hasOwn(value, key)), "Отсутствует обязательное поле").safeParse(value).success).safeParse(value).success, "Нарушено условие DTO").safeParse(value).success, "Нарушено ограничение DTO");
export type Material = z.infer<typeof MaterialSchema>;

export const WorkDetailSchema = z.strictObject({"work":WorkSummarySchema,"description":z.string().optional(),"topic":z.string().optional(),"stages":z.array(StageSchema),"stagesState":ListStatusSchema,"progress":WorkProgressSchema,"results":z.array(WorkResultSchema),"resultsState":ListStatusSchema,"relatedMaterials":z.array(MaterialSchema),"materialsState":ListStatusSchema,"focusStageId":z.string().min(1).max(240).optional()});
export type WorkDetail = z.infer<typeof WorkDetailSchema>;

export const AssessmentComponentSchema = z.strictObject({"componentId":z.string().min(1).max(240),"label":z.string().min(1),"value":AssessmentValueSchema.optional(),"weightText":z.string().min(1).max(120).optional(),"maxValue":z.string().regex(new RegExp("^\\d+(?:\\.\\d+)?$")).optional(),"state":DataStateSchema,"assessedAt":z.string().datetime({offset:true}).optional(),"linkedWorkId":z.string().min(1).max(240).optional()});
export type AssessmentComponent = z.infer<typeof AssessmentComponentSchema>;

export const OfficialCourseResultSchema = z.strictObject({"resultId":z.string().min(1).max(240),"label":z.string().min(1),"value":AssessmentValueSchema.optional(),"assessedAt":z.string().datetime({offset:true}).optional(),"attestationId":z.string().min(1).max(240).optional(),"state":DataStateSchema});
export type OfficialCourseResult = z.infer<typeof OfficialCourseResultSchema>;

export const AttestationSchema = z.strictObject({"attestationId":z.string().min(1).max(240),"kindLabel":z.string().min(1),"planned":AcademicDateSchema.optional(),"location":z.string().optional(),"state":DataStateSchema});
export type Attestation = z.infer<typeof AttestationSchema>;

export const ResultsViewSchema = z.strictObject({"gradingModelLabel":z.string().optional(),"gradingState":DataStateSchema,"components":z.array(AssessmentComponentSchema),"componentsState":ListStatusSchema,"attestations":z.array(AttestationSchema),"attestationsState":ListStatusSchema,"officialResult":OfficialCourseResultSchema.optional(),"officialResultState":DataStateSchema});
export type ResultsView = z.infer<typeof ResultsViewSchema>;

export const TimelineEntrySchema = z.strictObject({"timelineKey":z.string().min(1).max(240),"eventKind":z.union([z.literal("ISSUED"),z.literal("DUE"),z.literal("COMPLETED"),z.literal("SUBMITTED"),z.literal("ASSESSED"),z.literal("REVIEWED"),z.literal("ACTUAL"),z.literal("ATTESTATION"),z.literal("PLANNED")]),"when":AcademicDateSchema.optional(),"resultState":DataStateSchema.optional(),"value":AssessmentValueSchema.optional(),"title":z.string().min(1),"target":TargetSchema});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const OfferingDetailSchema = z.strictObject({"offering":OfferingSummarySchema,"sessions":z.array(ScheduleDetailSchema),"sessionsState":ListStatusSchema,"works":z.array(WorkSummarySchema),"worksState":ListStatusSchema,"results":ResultsViewSchema,"materials":z.array(MaterialSchema),"materialsState":ListStatusSchema,"progressLines":z.strictObject({"activity":DataStateSchema,"completion":DataStateSchema,"results":DataStateSchema})});
export type OfferingDetail = z.infer<typeof OfferingDetailSchema>;

export const IndependentUnitDetailSchema = z.strictObject({"unit":IndependentUnitSummarySchema,"works":z.array(WorkDetailSchema),"worksState":ListStatusSchema,"results":z.array(WorkResultSchema),"materials":z.array(MaterialSchema),"attestations":z.array(AttestationSchema),"timeline":z.array(TimelineEntrySchema),"timelineState":ListStatusSchema});
export type IndependentUnitDetail = z.infer<typeof IndependentUnitDetailSchema>;

export const AcademicSearchResultSchema = z.strictObject({"kind":z.union([z.literal("OFFERING"),z.literal("WORK")]),"title":z.string().min(1),"periodId":z.string().min(1).max(240),"periodLabel":z.string().min(1),"disciplineLabel":z.string().optional(),"targetRef":z.string().min(1).max(240)});
export type AcademicSearchResult = z.infer<typeof AcademicSearchResultSchema>;

export const AcademicSearchViewSchema = z.strictObject({"items":z.array(AcademicSearchResultSchema).max(10),"completeness":z.union([z.literal("COMPLETE"),z.literal("PARTIAL")]),"hasMore":z.boolean()});
export type AcademicSearchView = z.infer<typeof AcademicSearchViewSchema>;

export const AnnouncementSchema = z.strictObject({"announcementId":z.string().min(1).max(240),"title":z.string().min(1),"body":z.string().optional(),"publishedAt":z.string().datetime({offset:true}).optional(),"authorLabel":z.string().optional(),"validUntil":z.string().datetime({offset:true}).optional()});
export type Announcement = z.infer<typeof AnnouncementSchema>;

export const NotificationSchema = z.strictObject({"notificationKey":z.string().min(1).max(240),"category":z.union([z.literal("ANNOUNCEMENT"),z.literal("ACADEMIC_DEADLINE"),z.literal("SCHEDULE_CHANGE"),z.literal("APPEAL_REPLY"),z.literal("REQUEST_STATUS")]),"title":z.string().min(1),"bodyPreview":z.string().optional(),"occurredAt":z.string().datetime({offset:true}).optional(),"isRead":z.boolean(),"target":TargetSchema.optional()});
export type Notification = z.infer<typeof NotificationSchema>;

export const ReadResultSchema = z.strictObject({"markedCount":z.number().int().min(0),"alreadyReadCount":z.number().int().min(0)});
export type ReadResult = z.infer<typeof ReadResultSchema>;

export const ReadAllResultSchema = z.strictObject({"markedCount":z.number().int().min(0),"alreadyReadCount":z.number().int().min(0),"completeness":z.union([z.literal("COMPLETE"),z.literal("PARTIAL")]),"unavailableCategories":z.array(z.union([z.literal("ANNOUNCEMENT"),z.literal("ACADEMIC_DEADLINE"),z.literal("SCHEDULE_CHANGE"),z.literal("APPEAL_REPLY"),z.literal("REQUEST_STATUS")]))});
export type ReadAllResult = z.infer<typeof ReadAllResultSchema>;

export const DateTimeViewSchema = AcademicDateSchema;
export type DateTimeView = z.infer<typeof DateTimeViewSchema>;

export const CalendarItemSchema = z.strictObject({"eventKey":z.string().min(1).max(240),"origin":z.union([z.literal("UNIVERSITY_EVENT"),z.literal("ACADEMIC_DEADLINE"),z.literal("ATTESTATION")]),"title":z.string().min(1),"disciplineLabel":z.string().min(1).optional(),"starts":AcademicDateSchema,"ends":AcademicDateSchema.optional(),"location":z.string().optional(),"target":TargetSchema.optional(),"description":z.string().optional()});
export type CalendarItem = z.infer<typeof CalendarItemSchema>;

export const CalendarSelectionPreviewSchema = z.strictObject({"count":z.number().int().min(1),"selectionToken":z.string().min(20).max(512),"expiresAt":z.string().datetime({offset:true}),"filterSummary":z.strictObject({"from":z.string().date(),"to":z.string().date(),"eventKinds":z.array(z.union([z.literal("UNIVERSITY"),z.literal("ACADEMIC")])).min(1).max(2).refine(items => new Set(items.map(item => JSON.stringify(item))).size === items.length)})});
export type CalendarSelectionPreview = z.infer<typeof CalendarSelectionPreviewSchema>;

export const DashboardViewSchema = z.strictObject({"nextClasses":z.array(ScheduleEntrySchema),"upcomingWorks":z.array(WorkSummarySchema),"announcements":z.array(AnnouncementSchema),"notifications":z.array(NotificationSchema),"materials":z.array(MaterialSchema),"calendarHighlights":z.array(CalendarItemSchema),"upcomingDeadlines":z.array(CalendarItemSchema)});
export type DashboardView = z.infer<typeof DashboardViewSchema>;

export const RequestTypeSchema = z.union([z.strictObject({"requestTypeCode":z.literal("DEMO_CERTIFICATE"),"kind":z.literal("CERTIFICATE"),"displayName":z.literal("Справка об обучении (демо)"),"formSchemaVersion":z.literal("v1"),"fields":z.array(z.union([z.strictObject({"name":z.literal("copies"),"label":z.string().min(1),"kind":z.literal("INTEGER"),"required":z.literal(true),"minimum":z.literal(1),"maximum":z.literal(5)}),z.strictObject({"name":z.literal("presentationPlace"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(false),"maxLength":z.literal(160)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})]).refine(value => [z.strictObject({"name":z.literal("copies"),"label":z.string().min(1),"kind":z.literal("INTEGER"),"required":z.literal(true),"minimum":z.literal(1),"maximum":z.literal(5)}),z.strictObject({"name":z.literal("presentationPlace"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(false),"maxLength":z.literal(160)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO")).min(3).max(3).refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("copies")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("presentationPlace")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("comment")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO")}),z.strictObject({"requestTypeCode":z.literal("DEMO_APPLICATION"),"kind":z.literal("APPLICATION"),"displayName":z.literal("Общее заявление (демо)"),"formSchemaVersion":z.literal("v1"),"fields":z.array(z.union([z.strictObject({"name":z.literal("subject"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(true),"minLength":z.literal(3),"maxLength":z.literal(120)}),z.strictObject({"name":z.literal("statementBody"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(true),"minLength":z.literal(10),"maxLength":z.literal(3000)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})]).refine(value => [z.strictObject({"name":z.literal("subject"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(true),"minLength":z.literal(3),"maxLength":z.literal(120)}),z.strictObject({"name":z.literal("statementBody"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(true),"minLength":z.literal(10),"maxLength":z.literal(3000)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO")).min(3).max(3).refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("subject")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("statementBody")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("comment")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO")})]).refine(value => [z.strictObject({"requestTypeCode":z.literal("DEMO_CERTIFICATE"),"kind":z.literal("CERTIFICATE"),"displayName":z.literal("Справка об обучении (демо)"),"formSchemaVersion":z.literal("v1"),"fields":z.array(z.union([z.strictObject({"name":z.literal("copies"),"label":z.string().min(1),"kind":z.literal("INTEGER"),"required":z.literal(true),"minimum":z.literal(1),"maximum":z.literal(5)}),z.strictObject({"name":z.literal("presentationPlace"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(false),"maxLength":z.literal(160)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})]).refine(value => [z.strictObject({"name":z.literal("copies"),"label":z.string().min(1),"kind":z.literal("INTEGER"),"required":z.literal(true),"minimum":z.literal(1),"maximum":z.literal(5)}),z.strictObject({"name":z.literal("presentationPlace"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(false),"maxLength":z.literal(160)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO")).min(3).max(3).refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("copies")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("presentationPlace")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("comment")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO")}),z.strictObject({"requestTypeCode":z.literal("DEMO_APPLICATION"),"kind":z.literal("APPLICATION"),"displayName":z.literal("Общее заявление (демо)"),"formSchemaVersion":z.literal("v1"),"fields":z.array(z.union([z.strictObject({"name":z.literal("subject"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(true),"minLength":z.literal(3),"maxLength":z.literal(120)}),z.strictObject({"name":z.literal("statementBody"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(true),"minLength":z.literal(10),"maxLength":z.literal(3000)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})]).refine(value => [z.strictObject({"name":z.literal("subject"),"label":z.string().min(1),"kind":z.literal("TEXT"),"required":z.literal(true),"minLength":z.literal(3),"maxLength":z.literal(120)}),z.strictObject({"name":z.literal("statementBody"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(true),"minLength":z.literal(10),"maxLength":z.literal(3000)}),z.strictObject({"name":z.literal("comment"),"label":z.string().min(1),"kind":z.literal("LONG_TEXT"),"required":z.literal(false),"maxLength":z.literal(500)})].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO")).min(3).max(3).refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("subject")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("statementBody")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => Array.isArray(value) && (() => { const count = value.filter(item => (z.looseObject({"name":z.literal("comment")})).safeParse(item).success).length; return count >= 1 && count <= 1; })(), "Нарушено количество элементов contains").safeParse(value).success, "Нарушено ограничение DTO")})].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO");
export type RequestType = z.infer<typeof RequestTypeSchema>;

export const CertificateDataSchema = z.strictObject({"copies":z.number().int().min(1).max(5),"presentationPlace":z.string().max(160).optional(),"comment":z.string().max(500).optional()});
export type CertificateData = z.infer<typeof CertificateDataSchema>;

export const ApplicationDataSchema = z.strictObject({"subject":z.string().min(3).max(120),"statementBody":z.string().min(10).max(3000),"comment":z.string().max(500).optional()});
export type ApplicationData = z.infer<typeof ApplicationDataSchema>;

export const CreateRequestSchema = z.union([z.strictObject({"requestTypeCode":z.literal("DEMO_CERTIFICATE"),"formSchemaVersion":z.literal("v1"),"submittedData":CertificateDataSchema}),z.strictObject({"requestTypeCode":z.literal("DEMO_APPLICATION"),"formSchemaVersion":z.literal("v1"),"submittedData":ApplicationDataSchema})]).refine(value => [z.strictObject({"requestTypeCode":z.literal("DEMO_CERTIFICATE"),"formSchemaVersion":z.literal("v1"),"submittedData":CertificateDataSchema}),z.strictObject({"requestTypeCode":z.literal("DEMO_APPLICATION"),"formSchemaVersion":z.literal("v1"),"submittedData":ApplicationDataSchema})].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO");
export type CreateRequest = z.infer<typeof CreateRequestSchema>;

export const RequestTransitionSchema = z.strictObject({"transitionId":z.string().min(1).max(240),"businessStatus":z.union([z.literal("SUBMITTED"),z.literal("IN_PROGRESS"),z.literal("READY"),z.literal("REJECTED")]),"occurredAt":z.string().datetime({offset:true}),"reason":z.string().optional()});
export type RequestTransition = z.infer<typeof RequestTransitionSchema>;

export const StudentRequestSchema = z.strictObject({"id":z.string().min(1).max(240),"requestTypeCode":z.union([z.literal("DEMO_CERTIFICATE"),z.literal("DEMO_APPLICATION")]),"formSchemaVersion":z.literal("v1"),"submittedData":z.union([CertificateDataSchema,ApplicationDataSchema]).refine(value => [CertificateDataSchema,ApplicationDataSchema].filter(schema => schema.safeParse(value).success).length === 1, "Неоднозначный DTO"),"submittedAt":z.string().datetime({offset:true}),"localState":z.literal("STORED"),"businessStatus":z.union([z.literal("SUBMITTED"),z.literal("IN_PROGRESS"),z.literal("READY"),z.literal("REJECTED"),z.literal(null)]),"externalState":z.union([z.literal("PENDING"),z.literal("SENDING"),z.literal("ACKNOWLEDGED"),z.literal("UNKNOWN"),z.literal("RETRYABLE_ERROR"),z.literal("PERMANENT_TECHNICAL_ERROR")]),"statusInfo":z.string().optional(),"transitions":z.array(RequestTransitionSchema)}).refine(value => z.unknown().refine(value => !z.looseObject({"requestTypeCode":z.literal("DEMO_CERTIFICATE")}).safeParse(value).success || z.looseObject({"submittedData":CertificateDataSchema.optional()}).safeParse(value).success, "Нарушено условие DTO").safeParse(value).success, "Нарушено ограничение DTO").refine(value => z.unknown().refine(value => !z.looseObject({"requestTypeCode":z.literal("DEMO_APPLICATION")}).safeParse(value).success || z.looseObject({"submittedData":ApplicationDataSchema.optional()}).safeParse(value).success, "Нарушено условие DTO").safeParse(value).success, "Нарушено ограничение DTO");
export type StudentRequest = z.infer<typeof StudentRequestSchema>;

export const CreateAppealSchema = z.strictObject({"categoryCode":z.union([z.literal("QUESTION"),z.literal("PROBLEM"),z.literal("OTHER")]),"subject":z.string().min(3).max(120),"firstMessage":z.string().min(10).max(3000)});
export type CreateAppeal = z.infer<typeof CreateAppealSchema>;

export const AppealSchema = z.strictObject({"id":z.string().min(1).max(240),"categoryCode":z.union([z.literal("QUESTION"),z.literal("PROBLEM"),z.literal("OTHER")]),"subject":z.string().min(1),"status":z.literal("OPEN"),"createdAt":z.string().datetime({offset:true}),"externalState":z.union([z.literal("PENDING"),z.literal("SENDING"),z.literal("ACKNOWLEDGED"),z.literal("UNKNOWN"),z.literal("RETRYABLE_ERROR"),z.literal("PERMANENT_TECHNICAL_ERROR")]),"lastMessageAt":z.string().datetime({offset:true}).optional()});
export type Appeal = z.infer<typeof AppealSchema>;

export const MessageSchema = z.strictObject({"messageId":z.string().min(1).max(240),"appealId":z.string().min(1).max(240),"sequenceNumber":z.number().int().min(1),"senderKind":z.union([z.literal("STUDENT"),z.literal("EXTERNAL_PARTY")]),"senderLabel":z.string().min(1),"body":z.string().min(1),"createdAt":z.string().datetime({offset:true}),"sourceCreatedAt":z.string().datetime({offset:true}).optional(),"deliveryState":z.union([z.literal("PENDING"),z.literal("SENDING"),z.literal("ACKNOWLEDGED"),z.literal("UNKNOWN"),z.literal("RETRYABLE_ERROR"),z.literal("PERMANENT_TECHNICAL_ERROR")]).optional()});
export type Message = z.infer<typeof MessageSchema>;

export const AppealDetailSchema = z.strictObject({"appeal":AppealSchema,"recentMessages":z.array(MessageSchema),"messagesPage":ListStatusSchema});
export type AppealDetail = z.infer<typeof AppealDetailSchema>;

export const NewMessageSchema = z.strictObject({"body":z.string().min(1).max(3000)});
export type NewMessage = z.infer<typeof NewMessageSchema>;

export const ResolveOperationRequestSchema = z.strictObject({"operationScope":z.union([z.literal("CREATE_REQUEST"),z.literal("CREATE_APPEAL"),z.literal("CREATE_APPEAL_MESSAGE")]),"idempotencyKey":z.string().uuid()});
export type ResolveOperationRequest = z.infer<typeof ResolveOperationRequestSchema>;

export const ResolveOperationResultSchema = z.strictObject({"state":z.union([z.literal("COMMITTED"),z.literal("PENDING"),z.literal("NOT_FOUND"),z.literal("EXPIRED")]),"target":TargetSchema.optional(),"operationScope":z.union([z.literal("CREATE_REQUEST"),z.literal("CREATE_APPEAL"),z.literal("CREATE_APPEAL_MESSAGE")])});
export type ResolveOperationResult = z.infer<typeof ResolveOperationResultSchema>;

export const AssistantQuestionSchema = z.strictObject({"message":z.string().min(1).max(4000),"history":z.array(z.strictObject({"role":z.union([z.literal("user"),z.literal("assistant")]),"content":z.string().min(1).max(2000)})).max(8).optional(),"contextHint":z.union([z.literal("GENERAL"),z.literal("SCHEDULE"),z.literal("STUDY"),z.literal("DEADLINES"),z.literal("MATERIALS"),z.literal("REQUESTS"),z.literal("APPEALS"),z.literal("CALENDAR"),z.literal("NOTIFICATIONS")]).optional()});
export type AssistantQuestion = z.infer<typeof AssistantQuestionSchema>;

export const AssistantAnswerSchema = z.strictObject({"text":z.string().min(1),"providerMode":z.union([z.literal("GIGACHAT"),z.literal("DEMO_MOCK")]),"completeness":z.union([z.literal("COMPLETE"),z.literal("PARTIAL"),z.literal("UNKNOWN")]),"targets":z.array(TargetSchema).max(10),"notice":z.string().optional()});
export type AssistantAnswer = z.infer<typeof AssistantAnswerSchema>;

export const PeriodPageSchema = z.strictObject({"items":z.array(AcademicPeriodSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type PeriodPage = z.infer<typeof PeriodPageSchema>;

export const OfferingPageSchema = z.strictObject({"items":z.array(OfferingSummarySchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type OfferingPage = z.infer<typeof OfferingPageSchema>;

export const AcademicUnitPageSchema = z.strictObject({"items":z.array(IndependentUnitSummarySchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type AcademicUnitPage = z.infer<typeof AcademicUnitPageSchema>;

export const SchedulePageSchema = z.strictObject({"items":z.array(ScheduleEntrySchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type SchedulePage = z.infer<typeof SchedulePageSchema>;

export const WorkPageSchema = z.strictObject({"items":z.array(WorkSummarySchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type WorkPage = z.infer<typeof WorkPageSchema>;

export const SessionPageSchema = z.strictObject({"items":z.array(ScheduleDetailSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type SessionPage = z.infer<typeof SessionPageSchema>;

export const TimelinePageSchema = z.strictObject({"items":z.array(TimelineEntrySchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type TimelinePage = z.infer<typeof TimelinePageSchema>;

export const MaterialPageSchema = z.strictObject({"items":z.array(MaterialSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type MaterialPage = z.infer<typeof MaterialPageSchema>;

export const RequestPageSchema = z.strictObject({"items":z.array(StudentRequestSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type RequestPage = z.infer<typeof RequestPageSchema>;

export const AppealPageSchema = z.strictObject({"items":z.array(AppealSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type AppealPage = z.infer<typeof AppealPageSchema>;

export const MessagePageSchema = z.strictObject({"items":z.array(MessageSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type MessagePage = z.infer<typeof MessagePageSchema>;

export const NotificationPageSchema = z.strictObject({"items":z.array(NotificationSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type NotificationPage = z.infer<typeof NotificationPageSchema>;

export const AnnouncementPageSchema = z.strictObject({"items":z.array(AnnouncementSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type AnnouncementPage = z.infer<typeof AnnouncementPageSchema>;

export const AttestationPageSchema = z.strictObject({"items":z.array(AttestationSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type AttestationPage = z.infer<typeof AttestationPageSchema>;

export const CalendarPageSchema = z.strictObject({"items":z.array(CalendarItemSchema),"nextCursor":z.union([z.string(),z.null()]),"isComplete":z.union([z.boolean(),z.null()]),"dataState":DataStateSchema});
export type CalendarPage = z.infer<typeof CalendarPageSchema>;

export const SessionResponseSchema = z.strictObject({"data":SessionAccountSchema,"meta":ResponseMetaSchema});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const ProfileResponseSchema = z.strictObject({"data":ProfileSchema,"meta":ResponseMetaSchema});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const DashboardResponseSchema = z.strictObject({"data":DashboardViewSchema,"meta":ResponseMetaSchema});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

export const PeriodListResponseSchema = z.strictObject({"data":PeriodPageSchema,"meta":ResponseMetaSchema});
export type PeriodListResponse = z.infer<typeof PeriodListResponseSchema>;

export const OfferingListResponseSchema = z.strictObject({"data":OfferingPageSchema,"meta":ResponseMetaSchema});
export type OfferingListResponse = z.infer<typeof OfferingListResponseSchema>;

export const UnitListResponseSchema = z.strictObject({"data":AcademicUnitPageSchema,"meta":ResponseMetaSchema});
export type UnitListResponse = z.infer<typeof UnitListResponseSchema>;

export const UnitDetailResponseSchema = z.strictObject({"data":IndependentUnitDetailSchema,"meta":ResponseMetaSchema});
export type UnitDetailResponse = z.infer<typeof UnitDetailResponseSchema>;

export const OfferingDetailResponseSchema = z.strictObject({"data":OfferingDetailSchema,"meta":ResponseMetaSchema});
export type OfferingDetailResponse = z.infer<typeof OfferingDetailResponseSchema>;

export const ScheduleListResponseSchema = z.strictObject({"data":SchedulePageSchema,"meta":ResponseMetaSchema});
export type ScheduleListResponse = z.infer<typeof ScheduleListResponseSchema>;

export const ScheduleDetailResponseSchema = z.strictObject({"data":ScheduleDetailSchema,"meta":ResponseMetaSchema});
export type ScheduleDetailResponse = z.infer<typeof ScheduleDetailResponseSchema>;

export const SessionListResponseSchema = z.strictObject({"data":SessionPageSchema,"meta":ResponseMetaSchema});
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const WorkListResponseSchema = z.strictObject({"data":WorkPageSchema,"meta":ResponseMetaSchema});
export type WorkListResponse = z.infer<typeof WorkListResponseSchema>;

export const WorkDetailResponseSchema = z.strictObject({"data":WorkDetailSchema,"meta":ResponseMetaSchema});
export type WorkDetailResponse = z.infer<typeof WorkDetailResponseSchema>;

export const TimelineListResponseSchema = z.strictObject({"data":TimelinePageSchema,"meta":ResponseMetaSchema});
export type TimelineListResponse = z.infer<typeof TimelineListResponseSchema>;

export const MaterialListResponseSchema = z.strictObject({"data":MaterialPageSchema,"meta":ResponseMetaSchema});
export type MaterialListResponse = z.infer<typeof MaterialListResponseSchema>;

export const MaterialDetailResponseSchema = z.strictObject({"data":MaterialSchema,"meta":ResponseMetaSchema});
export type MaterialDetailResponse = z.infer<typeof MaterialDetailResponseSchema>;

export const ResultsResponseSchema = z.strictObject({"data":ResultsViewSchema,"meta":ResponseMetaSchema});
export type ResultsResponse = z.infer<typeof ResultsResponseSchema>;

export const AttestationsResponseSchema = z.strictObject({"data":AttestationPageSchema,"meta":ResponseMetaSchema});
export type AttestationsResponse = z.infer<typeof AttestationsResponseSchema>;

export const SearchResponseSchema = z.strictObject({"data":AcademicSearchViewSchema,"meta":ResponseMetaSchema});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const RequestTypeListResponseSchema = z.strictObject({"data":z.array(RequestTypeSchema),"meta":ResponseMetaSchema});
export type RequestTypeListResponse = z.infer<typeof RequestTypeListResponseSchema>;

export const RequestListResponseSchema = z.strictObject({"data":RequestPageSchema,"meta":ResponseMetaSchema});
export type RequestListResponse = z.infer<typeof RequestListResponseSchema>;

export const RequestDetailResponseSchema = z.strictObject({"data":StudentRequestSchema,"meta":ResponseMetaSchema});
export type RequestDetailResponse = z.infer<typeof RequestDetailResponseSchema>;

export const AppealListResponseSchema = z.strictObject({"data":AppealPageSchema,"meta":ResponseMetaSchema});
export type AppealListResponse = z.infer<typeof AppealListResponseSchema>;

export const AppealDetailResponseSchema = z.strictObject({"data":AppealDetailSchema,"meta":ResponseMetaSchema});
export type AppealDetailResponse = z.infer<typeof AppealDetailResponseSchema>;

export const MessageListResponseSchema = z.strictObject({"data":MessagePageSchema,"meta":ResponseMetaSchema});
export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

export const MessageDetailResponseSchema = z.strictObject({"data":MessageSchema,"meta":ResponseMetaSchema});
export type MessageDetailResponse = z.infer<typeof MessageDetailResponseSchema>;

export const NotificationListResponseSchema = z.strictObject({"data":NotificationPageSchema,"meta":ResponseMetaSchema});
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

export const NotificationDetailResponseSchema = z.strictObject({"data":NotificationSchema,"meta":ResponseMetaSchema});
export type NotificationDetailResponse = z.infer<typeof NotificationDetailResponseSchema>;

export const ReadResponseSchema = z.strictObject({"data":ReadResultSchema,"meta":ResponseMetaSchema});
export type ReadResponse = z.infer<typeof ReadResponseSchema>;

export const ReadAllResponseSchema = z.strictObject({"data":ReadAllResultSchema,"meta":ResponseMetaSchema});
export type ReadAllResponse = z.infer<typeof ReadAllResponseSchema>;

export const AnnouncementListResponseSchema = z.strictObject({"data":AnnouncementPageSchema,"meta":ResponseMetaSchema});
export type AnnouncementListResponse = z.infer<typeof AnnouncementListResponseSchema>;

export const AnnouncementDetailResponseSchema = z.strictObject({"data":AnnouncementSchema,"meta":ResponseMetaSchema});
export type AnnouncementDetailResponse = z.infer<typeof AnnouncementDetailResponseSchema>;

export const CalendarListResponseSchema = z.strictObject({"data":CalendarPageSchema,"meta":ResponseMetaSchema});
export type CalendarListResponse = z.infer<typeof CalendarListResponseSchema>;

export const CalendarEventResponseSchema = z.strictObject({"data":CalendarItemSchema,"meta":ResponseMetaSchema});
export type CalendarEventResponse = z.infer<typeof CalendarEventResponseSchema>;

export const CalendarPreviewResponseSchema = z.strictObject({"data":CalendarSelectionPreviewSchema,"meta":ResponseMetaSchema});
export type CalendarPreviewResponse = z.infer<typeof CalendarPreviewResponseSchema>;

export const ResolveResponseSchema = z.strictObject({"data":ResolveOperationResultSchema,"meta":ResponseMetaSchema});
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;

export const AssistantResponseSchema = z.strictObject({"data":AssistantAnswerSchema,"meta":ResponseMetaSchema});
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

export const RequestTypeDetailResponseSchema = z.strictObject({"data":RequestTypeSchema,"meta":ResponseMetaSchema});
export type RequestTypeDetailResponse = z.infer<typeof RequestTypeDetailResponseSchema>;

export const RequestStatusSchema = z.strictObject({"id":z.string().min(1).max(240),"businessStatus":z.union([z.literal("SUBMITTED"),z.literal("IN_PROGRESS"),z.literal("READY"),z.literal("REJECTED"),z.literal(null)]),"externalState":z.union([z.literal("PENDING"),z.literal("SENDING"),z.literal("ACKNOWLEDGED"),z.literal("UNKNOWN"),z.literal("RETRYABLE_ERROR"),z.literal("PERMANENT_TECHNICAL_ERROR")]),"transitions":z.array(RequestTransitionSchema)});
export type RequestStatus = z.infer<typeof RequestStatusSchema>;

export const RequestStatusResponseSchema = z.strictObject({"data":RequestStatusSchema,"meta":ResponseMetaSchema});
export type RequestStatusResponse = z.infer<typeof RequestStatusResponseSchema>;

export const MarkReadRequestSchema = z.strictObject({"notificationKeys":z.array(z.string().min(1).max(240)).min(1).max(50)});
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;
