import { z } from "zod";

export const entityTypeSchema = z.enum([
  "task_category",
  "tag",
  "task",
  "tag_link",
  "note",
  "schedule_block",
  "focus_session",
  "life_event",
  "countdown",
  "finance_transaction",
  "daily_quote",
]);

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export const lifeEventKindSchema = z.enum(["sleep", "wake", "other"]);
export const themeModeSchema = z.enum(["system", "light", "dark"]);
export const uiScaleSchema = z.union([
  z.literal(80),
  z.literal(90),
  z.literal(100),
  z.literal(110),
  z.literal(125),
  z.literal(150),
]);

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year!, month! - 1, day!);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month! - 1 &&
      date.getDate() === day
    );
  }, "日期无效");

export const taskDraftSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  descriptionMd: z.string().max(100_000).nullable().default(null),
  status: taskStatusSchema.default("todo"),
  priority: z.number().int().min(1).max(3).default(1),
  dueAt: z.string().datetime(),
  estimatedMinutes: z.number().int().min(0).max(100_000).default(0),
  categoryId: z.string().nullable().default(null),
  repeatRule: z.string().nullable().default(null),
  tagIds: z.array(z.string()).default([]),
});

export const recurrenceFrequencySchema = z.enum([
  "daily",
  "weekdays",
  "weekly",
]);

export const taskBatchDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  descriptionMd: z.string().max(100_000).nullable().default(null),
  priority: z.number().int().min(1).max(3).default(1),
  estimatedMinutes: z.number().int().min(0).max(100_000).default(0),
  categoryId: z.string().nullable().default(null),
  tagIds: z.array(z.string()).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .default(null),
  frequency: recurrenceFrequencySchema,
});

export const memoDraftSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  descriptionMd: z.string().max(100_000).nullable().default(null),
  priority: z.number().int().min(1).max(3).default(1),
  categoryId: z.string().nullable().default(null),
  tagIds: z.array(z.string()).default([]),
});

export const countdownDraftSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  targetDate: localDateSchema,
  note: z.string().max(10_000).nullable().default(null),
});

export const scheduleDraftSchema = z
  .object({
    id: z.string().min(1).optional(),
    title: z.string().trim().min(1).max(300),
    taskId: z.string().nullable().default(null),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    isAllDay: z.boolean().default(false),
    colorHex: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .default("#397BC6"),
  })
  .refine((value) => Date.parse(value.endAt) > Date.parse(value.startAt), {
    message: "结束时间必须晚于开始时间",
    path: ["endAt"],
  });

export const lifeEventDraftSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(300),
  kind: lifeEventKindSchema,
  occurredAt: z.string().datetime(),
  note: z.string().max(10_000).nullable().default(null),
});

export const syncOperationSchema = z.object({
  operationId: z.string().min(1),
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  operation: z.enum(["upsert", "delete"]),
  baseRevision: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
});

export const backupManifestV6Schema = z.object({
  schemaVersion: z.literal(6),
  appVersion: z.string(),
  exportedAt: z.string().datetime(),
  payloadFile: z.literal("data.json"),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

export const backupManifestV7Schema = z.object({
  schemaVersion: z.literal(7),
  appVersion: z.string(),
  exportedAt: z.string().datetime(),
  payloadFile: z.literal("data.json"),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

export const backupManifestV8Schema = z.object({
  schemaVersion: z.literal(8),
  appVersion: z.string(),
  exportedAt: z.string().datetime(),
  payloadFile: z.literal("data.json"),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

export const backupManifestV9Schema = z.object({
  schemaVersion: z.literal(9),
  appVersion: z.string(),
  exportedAt: z.string().datetime(),
  payloadFile: z.literal("data.json"),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type TaskBatchDraft = z.infer<typeof taskBatchDraftSchema>;
export type MemoDraft = Omit<z.infer<typeof memoDraftSchema>, "priority"> & {
  priority?: number;
};
export type CountdownDraft = z.infer<typeof countdownDraftSchema>;
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;
export type ScheduleDraft = z.infer<typeof scheduleDraftSchema>;
export type LifeEventDraft = z.infer<typeof lifeEventDraftSchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type BackupManifestV6 = z.infer<typeof backupManifestV6Schema>;
export type BackupManifestV7 = z.infer<typeof backupManifestV7Schema>;
export type BackupManifestV8 = z.infer<typeof backupManifestV8Schema>;
export type BackupManifestV9 = z.infer<typeof backupManifestV9Schema>;
export type ThemeMode = z.infer<typeof themeModeSchema>;
export type UiScale = z.infer<typeof uiScaleSchema>;
