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
]);

export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export const lifeEventKindSchema = z.enum(["sleep", "wake", "other"]);
export const themeModeSchema = z.enum(["system", "light", "dark"]);

export const taskDraftSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(200),
  descriptionMd: z.string().max(100_000).nullable().default(null),
  status: taskStatusSchema.default("todo"),
  priority: z.number().int().min(1).max(3).default(1),
  dueAt: z.string().datetime().nullable().default(null),
  estimatedMinutes: z.number().int().min(0).max(100_000).default(0),
  categoryId: z.string().nullable().default(null),
  repeatRule: z.string().nullable().default(null),
  tagIds: z.array(z.string()).default([]),
});

export const noteDraftSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(300),
  contentMd: z.string().max(2_000_000),
  isPinned: z.boolean().default(false),
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
      .default("#2563EB"),
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

export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type NoteDraft = z.infer<typeof noteDraftSchema>;
export type ScheduleDraft = z.infer<typeof scheduleDraftSchema>;
export type LifeEventDraft = z.infer<typeof lifeEventDraftSchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type BackupManifestV6 = z.infer<typeof backupManifestV6Schema>;
export type ThemeMode = z.infer<typeof themeModeSchema>;
