import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  countdownDraftSchema,
  lifeEventDraftSchema,
  memoDraftSchema,
  noteDraftSchema,
  scheduleDraftSchema,
  taskBatchDraftSchema,
  taskDraftSchema,
  themeModeSchema,
  uiScaleSchema,
  type LifeEventDraft,
  type CountdownDraft,
  type MemoDraft,
  type NoteDraft,
  type ScheduleDraft,
  type TaskBatchDraft,
  type TaskDraft,
} from "@zhixu/contracts";
import type {
  AppSettings,
  CategoryRecord,
  CountdownRecord,
  DashboardSummary,
  FocusSessionRecord,
  ImportBatchRecord,
  ImportResult,
  LifeEventRecord,
  MemoRecord,
  NoteRecord,
  ScheduleBlockRecord,
  SearchHit,
  TagRecord,
  TaskRecord,
  TaskBatchResult,
  TomatoPreview,
} from "../preload/api-types";
import { classifyLifeEvent, normalizeLegacyTomatoText } from "../shared/domain";
import { normalizeTagName, tagColorHex } from "../shared/tag-colors";
import {
  buildOccurrenceDates,
  combineLocalDueAt,
} from "../shared/task-schedule";

const dataTables = [
  "task_categories",
  "tags",
  "tasks",
  "tag_links",
  "task_items",
  "schedule_blocks",
  "notebooks",
  "notes",
  "note_versions",
  "reminders",
  "focus_sessions",
  "life_events",
  "countdowns",
  "import_batches",
  "import_batch_changes",
] as const;

type SqlRow = Record<string, unknown>;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function toEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error(`无效时间：${value}`);
  return Math.floor(milliseconds / 1000);
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string" && /^\d+$/.test(value))
    return new Date(Number(value) * 1000).toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function asTask(row: SqlRow): TaskRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    descriptionMd:
      row.description_md == null ? null : String(row.description_md),
    status: String(row.status) as TaskRecord["status"],
    priority: Number(row.priority),
    dueAt: toIso(row.due_at),
    estimatedMinutes: Number(row.estimated_minutes ?? 0),
    categoryId: row.category_id == null ? null : String(row.category_id),
    repeatRule: row.repeat_rule == null ? null : String(row.repeat_rule),
    completedAt: toIso(row.completed_at),
    isArchived: bool(row.is_archived),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
    deletedAt: toIso(row.deleted_at),
    tagIds:
      typeof row.tag_ids === "string" && row.tag_ids.length > 0
        ? row.tag_ids.split(",").filter(Boolean)
        : [],
  };
}

function asFocus(row: SqlRow): FocusSessionRecord {
  return {
    id: String(row.id),
    sourceKey: String(row.source_key),
    startAt: toIso(row.start_at) ?? new Date(0).toISOString(),
    endAt: toIso(row.end_at) ?? new Date(0).toISOString(),
    taskName: String(row.task_name),
    durationMinutes: Number(row.duration_minutes),
    reflection: row.reflection == null ? null : String(row.reflection),
    status: String(row.status),
    importBatchId:
      row.import_batch_id == null ? null : String(row.import_batch_id),
  };
}

function asEvent(row: SqlRow): LifeEventRecord {
  return {
    id: String(row.id),
    sourceKey: String(row.source_key),
    source: String(row.source),
    kind: String(row.kind) as LifeEventRecord["kind"],
    title: String(row.title),
    occurredAt: toIso(row.occurred_at) ?? new Date(0).toISOString(),
    note: row.note == null ? null : String(row.note),
    importBatchId:
      row.import_batch_id == null ? null : String(row.import_batch_id),
  };
}

function asCountdown(row: SqlRow): CountdownRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    targetDate: String(row.target_date),
    note: row.note == null ? null : String(row.note),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function bindable(value: unknown): string | number | bigint | Buffer | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }
  return JSON.stringify(value);
}

export class ZhixuStore {
  constructor(private readonly db: Database.Database) {}

  listTasks(): TaskRecord[] {
    const rows = this.db
      .prepare(
        `SELECT t.*,
          (SELECT group_concat(tl.tag_id)
           FROM tag_links tl
           WHERE tl.entity_type = 'task' AND tl.entity_id = t.id AND tl.deleted_at IS NULL) AS tag_ids
         FROM tasks t
         WHERE t.deleted_at IS NULL AND t.is_archived = 0 AND t.external_source IS NULL
           AND t.due_at IS NOT NULL
         ORDER BY t.updated_at DESC`,
      )
      .all() as SqlRow[];
    return rows.map(asTask);
  }

  saveTask(input: TaskDraft): string {
    const draft = taskDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowSeconds();
    const existing = this.db
      .prepare("SELECT id, created_at, due_at FROM tasks WHERE id = ?")
      .get(id) as SqlRow | undefined;
    if (existing && existing.due_at == null)
      throw new Error("备忘不能通过任务编辑器保存");
    const run = this.db.transaction(() => {
      if (existing) {
        this.db
          .prepare(
            `UPDATE tasks SET title = ?, description_md = ?, status = ?, priority = ?, due_at = ?,
             estimated_minutes = ?, category_id = ?, repeat_rule = ?, completed_at = ?, updated_at = ?,
             deleted_at = NULL, is_archived = 0 WHERE id = ?`,
          )
          .run(
            draft.title,
            draft.descriptionMd,
            draft.status,
            draft.priority,
            toEpoch(draft.dueAt),
            draft.estimatedMinutes,
            draft.categoryId,
            draft.repeatRule,
            draft.status === "done" ? now : null,
            now,
            id,
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO tasks
             (id, title, description_md, status, priority, due_at, estimated_minutes, category_id,
              repeat_rule, completed_at, is_archived, created_at, updated_at, device_id, server_revision)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'electron-windows', 0)`,
          )
          .run(
            id,
            draft.title,
            draft.descriptionMd,
            draft.status,
            draft.priority,
            toEpoch(draft.dueAt),
            draft.estimatedMinutes,
            draft.categoryId,
            draft.repeatRule,
            draft.status === "done" ? now : null,
            now,
            now,
          );
      }
      this.replaceTaskTags(id, draft.tagIds, now);
      this.enqueue(
        "task",
        id,
        "upsert",
        this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as SqlRow,
      );
    });
    run();
    return id;
  }

  createTaskBatch(input: TaskBatchDraft): TaskBatchResult {
    const draft = taskBatchDraftSchema.parse(input);
    const dates = buildOccurrenceDates(
      draft.startDate,
      draft.endDate,
      draft.frequency,
    );
    const ids = dates.map(() => randomUUID());
    const primaryId = ids[0]!;
    const now = nowSeconds();
    const repeatRule = JSON.stringify({
      frequency: draft.frequency,
      startDate: draft.startDate,
      endDate: draft.endDate,
      time: draft.time,
    });
    const insert = this.db.prepare(
      `INSERT INTO tasks
       (id, title, description_md, status, priority, due_at, estimated_minutes, category_id,
        repeat_rule, parent_task_id, completed_at, is_archived, created_at, updated_at,
        device_id, server_revision)
       VALUES (?, ?, ?, 'todo', ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, 'electron-windows', 0)`,
    );
    const run = this.db.transaction(() => {
      dates.forEach((date, index) => {
        const id = ids[index]!;
        insert.run(
          id,
          draft.title,
          draft.descriptionMd,
          draft.priority,
          toEpoch(combineLocalDueAt(date, draft.time)),
          draft.estimatedMinutes,
          draft.categoryId,
          repeatRule,
          index === 0 ? null : primaryId,
          now,
          now,
        );
        this.replaceTaskTags(id, draft.tagIds, now);
        this.enqueue(
          "task",
          id,
          "upsert",
          this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as SqlRow,
        );
      });
    });
    run();
    return { primaryId, createdCount: ids.length, ids };
  }

  listMemos(): MemoRecord[] {
    const rows = this.db
      .prepare(
        `SELECT t.*,
          (SELECT group_concat(tl.tag_id)
           FROM tag_links tl
           WHERE tl.entity_type = 'task' AND tl.entity_id = t.id AND tl.deleted_at IS NULL) AS tag_ids
         FROM tasks t
         WHERE t.deleted_at IS NULL AND t.is_archived = 0 AND t.external_source IS NULL
           AND t.due_at IS NULL
         ORDER BY t.updated_at DESC`,
      )
      .all() as SqlRow[];
    return rows.map((row) => {
      const task = asTask(row);
      return {
        id: task.id,
        title: task.title,
        descriptionMd: task.descriptionMd,
        categoryId: task.categoryId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        tagIds: task.tagIds,
      };
    });
  }

  saveMemo(input: MemoDraft): string {
    const draft = memoDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowSeconds();
    const existing = this.db
      .prepare("SELECT id, due_at FROM tasks WHERE id = ?")
      .get(id) as SqlRow | undefined;
    if (existing && existing.due_at != null)
      throw new Error("任务不能通过备忘编辑器保存");
    const run = this.db.transaction(() => {
      if (existing) {
        this.db
          .prepare(
            `UPDATE tasks SET title = ?, description_md = ?, category_id = ?, updated_at = ?,
             deleted_at = NULL, is_archived = 0 WHERE id = ? AND due_at IS NULL`,
          )
          .run(draft.title, draft.descriptionMd, draft.categoryId, now, id);
      } else {
        this.db
          .prepare(
            `INSERT INTO tasks
             (id, title, description_md, status, priority, due_at, estimated_minutes, category_id,
              repeat_rule, completed_at, is_archived, created_at, updated_at, device_id, server_revision)
             VALUES (?, ?, ?, 'todo', 1, NULL, 0, ?, NULL, NULL, 0, ?, ?, 'electron-windows', 0)`,
          )
          .run(
            id,
            draft.title,
            draft.descriptionMd,
            draft.categoryId,
            now,
            now,
          );
      }
      this.replaceTaskTags(id, draft.tagIds, now);
      this.enqueue(
        "task",
        id,
        "upsert",
        this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as SqlRow,
      );
    });
    run();
    return id;
  }

  listCountdowns(): CountdownRecord[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM countdowns
           WHERE deleted_at IS NULL
           ORDER BY target_date, title COLLATE NOCASE`,
        )
        .all() as SqlRow[]
    ).map(asCountdown);
  }

  saveCountdown(input: CountdownDraft): string {
    const draft = countdownDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowSeconds();
    const existing = this.db
      .prepare("SELECT id FROM countdowns WHERE id = ?")
      .get(id) as SqlRow | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE countdowns
           SET title = ?, target_date = ?, note = ?, updated_at = ?, deleted_at = NULL
           WHERE id = ?`,
        )
        .run(draft.title, draft.targetDate, draft.note, now, id);
    } else {
      this.db
        .prepare(
          `INSERT INTO countdowns
           (id, title, target_date, note, created_at, updated_at, device_id, server_revision)
           VALUES (?, ?, ?, ?, ?, ?, 'electron-windows', 0)`,
        )
        .run(id, draft.title, draft.targetDate, draft.note, now, now);
    }
    this.enqueue(
      "countdown",
      id,
      "upsert",
      this.db
        .prepare("SELECT * FROM countdowns WHERE id = ?")
        .get(id) as SqlRow,
    );
    return id;
  }

  removeCountdown(id: string): void {
    const now = nowSeconds();
    this.db
      .prepare(
        "UPDATE countdowns SET deleted_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(now, now, id);
    this.enqueue("countdown", id, "delete", { id, deleted_at: now });
  }

  setTaskStatus(id: string, status: TaskRecord["status"]): void {
    const now = nowSeconds();
    this.db
      .prepare(
        "UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
      )
      .run(status, status === "done" ? now : null, now, id);
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      SqlRow | undefined;
    if (row) this.enqueue("task", id, "upsert", row);
  }

  removeTask(id: string): void {
    const now = nowSeconds();
    this.db
      .prepare("UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
    this.enqueue("task", id, "delete", { id, deleted_at: now });
  }

  listCategories(): CategoryRecord[] {
    return (
      this.db
        .prepare(
          `SELECT id, name, color_hex, source, is_archived FROM task_categories
           WHERE deleted_at IS NULL ORDER BY is_archived, name COLLATE NOCASE`,
        )
        .all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      colorHex: String(row.color_hex),
      source: String(row.source),
      isArchived: bool(row.is_archived),
    }));
  }

  listTags(): TagRecord[] {
    return (
      this.db
        .prepare(
          `SELECT id, name, color_hex, is_archived FROM tags
           WHERE deleted_at IS NULL ORDER BY is_archived, name COLLATE NOCASE`,
        )
        .all() as SqlRow[]
    ).map((row) => {
      const name = String(row.name);
      return {
        id: String(row.id),
        name,
        colorHex: tagColorHex(name),
        isArchived: bool(row.is_archived),
      };
    });
  }

  saveTag(input: { id?: string; name: string }): string {
    const name = input.name.trim();
    if (!name) throw new Error("标签名称不能为空");
    const id = input.id ?? randomUUID();
    const now = nowSeconds();
    const conflict = this.db
      .prepare(
        "SELECT id FROM tags WHERE normalized_name = ? AND deleted_at IS NULL AND id <> ?",
      )
      .get(normalizeTagName(name), id);
    if (conflict) throw new Error("已存在同名标签");
    this.db
      .prepare(
        `INSERT INTO tags
         (id, name, normalized_name, color_hex, is_archived, created_at, updated_at, device_id, server_revision)
         VALUES (?, ?, ?, ?, 0, ?, ?, 'electron-windows', 0)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name,
           color_hex = excluded.color_hex, is_archived = 0, deleted_at = NULL, updated_at = excluded.updated_at`,
      )
      .run(id, name, normalizeTagName(name), tagColorHex(name), now, now);
    this.enqueue(
      "tag",
      id,
      "upsert",
      this.db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as SqlRow,
    );
    return id;
  }

  removeTag(id: string): void {
    const now = nowSeconds();
    const run = this.db.transaction(() => {
      this.db
        .prepare("UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, id);
      this.db
        .prepare(
          "UPDATE tag_links SET deleted_at = ?, updated_at = ? WHERE tag_id = ? AND deleted_at IS NULL",
        )
        .run(now, now, id);
      this.enqueue("tag", id, "delete", { id, deleted_at: now });
    });
    run();
  }

  private replaceTaskTags(taskId: string, tagIds: string[], now: number): void {
    const existing = this.db
      .prepare(
        "SELECT * FROM tag_links WHERE entity_type = 'task' AND entity_id = ?",
      )
      .all(taskId) as SqlRow[];
    const desired = new Set(tagIds);
    for (const row of existing) {
      const tagId = String(row.tag_id);
      if (!desired.has(tagId) && row.deleted_at == null) {
        this.db
          .prepare(
            "UPDATE tag_links SET deleted_at = ?, updated_at = ? WHERE id = ?",
          )
          .run(now, now, row.id);
        this.enqueue("tag_link", String(row.id), "delete", {
          id: row.id,
          deleted_at: now,
        });
      }
      desired.delete(tagId);
    }
    for (const tagId of desired) {
      const id = randomUUID();
      this.db
        .prepare(
          `INSERT INTO tag_links
           (id, tag_id, entity_type, entity_id, created_at, updated_at, device_id, server_revision)
           VALUES (?, ?, 'task', ?, ?, ?, 'electron-windows', 0)`,
        )
        .run(id, tagId, taskId, now, now);
      this.enqueue(
        "tag_link",
        id,
        "upsert",
        this.db
          .prepare("SELECT * FROM tag_links WHERE id = ?")
          .get(id) as SqlRow,
      );
    }
  }

  listNotes(): NoteRecord[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY is_pinned DESC, updated_at DESC",
        )
        .all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      contentMd: String(row.content_md ?? ""),
      isPinned: bool(row.is_pinned),
      createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
      updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
    }));
  }

  saveNote(input: NoteDraft): string {
    const draft = noteDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowSeconds();
    const existing = this.db
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(id) as SqlRow | undefined;
    const run = this.db.transaction(() => {
      if (existing) {
        this.db
          .prepare(
            `INSERT INTO note_versions (id, note_id, title, content_md, created_at, source)
             VALUES (?, ?, ?, ?, ?, 'edit')`,
          )
          .run(randomUUID(), id, existing.title, existing.content_md, now);
        this.db
          .prepare(
            `UPDATE notes SET title = ?, content_md = ?, is_pinned = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`,
          )
          .run(draft.title, draft.contentMd, draft.isPinned ? 1 : 0, now, id);
      } else {
        this.db
          .prepare(
            `INSERT INTO notes
             (id, title, content_md, is_pinned, created_at, updated_at, device_id, server_revision)
             VALUES (?, ?, ?, ?, ?, ?, 'electron-windows', 0)`,
          )
          .run(
            id,
            draft.title,
            draft.contentMd,
            draft.isPinned ? 1 : 0,
            now,
            now,
          );
        this.db
          .prepare(
            `INSERT INTO note_versions (id, note_id, title, content_md, created_at, source)
             VALUES (?, ?, ?, ?, ?, 'create')`,
          )
          .run(randomUUID(), id, draft.title, draft.contentMd, now);
      }
      this.enqueue(
        "note",
        id,
        "upsert",
        this.db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as SqlRow,
      );
    });
    run();
    return id;
  }

  removeNote(id: string): void {
    const now = nowSeconds();
    this.db
      .prepare("UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, id);
    this.enqueue("note", id, "delete", { id, deleted_at: now });
  }

  listScheduleBlocks(startAt: string, endAt: string): ScheduleBlockRecord[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM schedule_blocks
           WHERE deleted_at IS NULL AND start_at < ? AND end_at >= ? ORDER BY start_at`,
        )
        .all(toEpoch(endAt), toEpoch(startAt)) as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      taskId: row.task_id == null ? null : String(row.task_id),
      startAt: toIso(row.start_at) ?? new Date(0).toISOString(),
      endAt: toIso(row.end_at) ?? new Date(0).toISOString(),
      isAllDay: bool(row.is_all_day),
      colorHex: String(row.color_hex),
    }));
  }

  saveScheduleBlock(input: ScheduleDraft): string {
    const draft = scheduleDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowSeconds();
    this.db
      .prepare(
        `INSERT INTO schedule_blocks
         (id, title, task_id, start_at, end_at, is_all_day, color_hex, created_at, updated_at, device_id, server_revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'electron-windows', 0)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, task_id = excluded.task_id,
           start_at = excluded.start_at, end_at = excluded.end_at, is_all_day = excluded.is_all_day,
           color_hex = excluded.color_hex, updated_at = excluded.updated_at, deleted_at = NULL`,
      )
      .run(
        id,
        draft.title,
        draft.taskId,
        toEpoch(draft.startAt),
        toEpoch(draft.endAt),
        draft.isAllDay ? 1 : 0,
        draft.colorHex,
        now,
        now,
      );
    this.enqueue(
      "schedule_block",
      id,
      "upsert",
      this.db
        .prepare("SELECT * FROM schedule_blocks WHERE id = ?")
        .get(id) as SqlRow,
    );
    return id;
  }

  removeScheduleBlock(id: string): void {
    const now = nowSeconds();
    this.db
      .prepare(
        "UPDATE schedule_blocks SET deleted_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(now, now, id);
    this.enqueue("schedule_block", id, "delete", { id, deleted_at: now });
  }

  listFocusSessions(): FocusSessionRecord[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM focus_sessions WHERE deleted_at IS NULL ORDER BY start_at DESC",
        )
        .all() as SqlRow[]
    ).map(asFocus);
  }

  listImportBatches(): ImportBatchRecord[] {
    return (
      this.db
        .prepare("SELECT * FROM import_batches ORDER BY created_at DESC")
        .all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      fileName: String(row.file_name),
      fileHash: String(row.file_hash),
      exportUser: row.export_user == null ? null : String(row.export_user),
      rangeStart: toIso(row.range_start),
      rangeEnd: toIso(row.range_end),
      declaredMinutes:
        row.declared_minutes == null ? null : Number(row.declared_minutes),
      declaredRecords:
        row.declared_records == null ? null : Number(row.declared_records),
      importedCount: Number(row.imported_count),
      skippedCount: Number(row.skipped_count),
      errorMessage:
        row.error_message == null ? null : String(row.error_message),
      createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
      rolledBackAt: toIso(row.rolled_back_at),
    }));
  }

  importTomato(preview: TomatoPreview): ImportResult {
    const batchId = randomUUID();
    const now = nowSeconds();
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let focusImportedCount = 0;
    let lifeEventImportedCount = 0;

    const run = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO import_batches
           (id, source, file_name, file_hash, export_user, range_start, range_end, declared_minutes,
            declared_records, imported_count, skipped_count, created_at)
           VALUES (?, 'tomatodo', ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        )
        .run(
          batchId,
          preview.fileName,
          preview.fileHash,
          preview.exportUser,
          toEpoch(preview.rangeStart),
          toEpoch(preview.rangeEnd),
          preview.declaredMinutes,
          preview.declaredRecords,
          now,
        );

      for (const session of preview.sessions) {
        const taskName =
          normalizeLegacyTomatoText(session.taskName).trim() || "未命名记录";
        if (session.durationMinutes > 0) {
          const existing = this.db
            .prepare(
              "SELECT * FROM focus_sessions WHERE source_key IN (?, ?) ORDER BY updated_at DESC LIMIT 1",
            )
            .get(
              session.sourceKey,
              session.legacySourceKey ?? session.sourceKey,
            ) as SqlRow | undefined;
          const payload = {
            source_key: session.sourceKey,
            task_name: taskName,
            start_at: toEpoch(session.startAt),
            end_at: toEpoch(session.endAt),
            duration_minutes: session.durationMinutes,
            reflection: session.reflection,
            status: normalizeLegacyTomatoText(session.status),
          };
          if (!existing) {
            const id = randomUUID();
            this.db
              .prepare(
                `INSERT INTO focus_sessions
                 (id, source_key, source, start_at, end_at, task_name, duration_minutes, reflection, status,
                  import_batch_id, created_at, updated_at, device_id, server_revision)
                 VALUES (?, ?, 'tomatodo', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'electron-windows', 0)`,
              )
              .run(
                id,
                payload.source_key,
                payload.start_at,
                payload.end_at,
                payload.task_name,
                payload.duration_minutes,
                payload.reflection,
                payload.status,
                batchId,
                now,
                now,
              );
            this.recordImportChange(
              batchId,
              "focus_session",
              id,
              "insert",
              null,
              payload,
              now,
            );
            this.enqueue(
              "focus_session",
              id,
              "upsert",
              this.db
                .prepare("SELECT * FROM focus_sessions WHERE id = ?")
                .get(id) as SqlRow,
            );
            importedCount += 1;
            focusImportedCount += 1;
          } else {
            const unchanged =
              String(existing.task_name) === payload.task_name &&
              Number(existing.duration_minutes) === payload.duration_minutes &&
              String(existing.status) === payload.status &&
              existing.deleted_at == null;
            if (unchanged) {
              skippedCount += 1;
            } else {
              const before = { ...existing };
              this.db
                .prepare(
                  `UPDATE focus_sessions SET source_key = ?, task_name = ?, start_at = ?, end_at = ?,
                   duration_minutes = ?, reflection = ?, status = ?, import_batch_id = ?, updated_at = ?, deleted_at = NULL
                   WHERE id = ?`,
                )
                .run(
                  payload.source_key,
                  payload.task_name,
                  payload.start_at,
                  payload.end_at,
                  payload.duration_minutes,
                  payload.reflection,
                  payload.status,
                  batchId,
                  now,
                  existing.id,
                );
              this.recordImportChange(
                batchId,
                "focus_session",
                String(existing.id),
                "update",
                before,
                payload,
                now,
              );
              updatedCount += 1;
            }
          }
          this.ensureTomatoCategory(taskName, now);
        } else {
          const kind = classifyLifeEvent(taskName);
          const existing = this.db
            .prepare(
              "SELECT * FROM life_events WHERE source_key IN (?, ?) ORDER BY updated_at DESC LIMIT 1",
            )
            .get(
              session.sourceKey,
              session.legacySourceKey ?? session.sourceKey,
            ) as SqlRow | undefined;
          if (
            existing &&
            existing.deleted_at == null &&
            String(existing.title) === taskName
          ) {
            skippedCount += 1;
          } else if (existing) {
            const before = { ...existing };
            this.db
              .prepare(
                `UPDATE life_events SET source_key = ?, kind = ?, title = ?, occurred_at = ?, note = ?,
                 import_batch_id = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`,
              )
              .run(
                session.sourceKey,
                kind,
                taskName,
                toEpoch(session.startAt),
                session.reflection,
                batchId,
                now,
                existing.id,
              );
            this.recordImportChange(
              batchId,
              "life_event",
              String(existing.id),
              "update",
              before,
              null,
              now,
            );
            updatedCount += 1;
          } else {
            const id = randomUUID();
            this.db
              .prepare(
                `INSERT INTO life_events
                 (id, source_key, source, kind, title, occurred_at, note, import_batch_id,
                  created_at, updated_at, device_id, server_revision)
                 VALUES (?, ?, 'tomatodo', ?, ?, ?, ?, ?, ?, ?, 'electron-windows', 0)`,
              )
              .run(
                id,
                session.sourceKey,
                kind,
                taskName,
                toEpoch(session.startAt),
                session.reflection,
                batchId,
                now,
                now,
              );
            this.recordImportChange(
              batchId,
              "life_event",
              id,
              "insert",
              null,
              null,
              now,
            );
            this.enqueue(
              "life_event",
              id,
              "upsert",
              this.db
                .prepare("SELECT * FROM life_events WHERE id = ?")
                .get(id) as SqlRow,
            );
            importedCount += 1;
            lifeEventImportedCount += 1;
          }
        }
      }
      this.db
        .prepare(
          "UPDATE import_batches SET imported_count = ?, skipped_count = ? WHERE id = ?",
        )
        .run(importedCount + updatedCount, skippedCount, batchId);
    });
    run();
    return {
      importedCount,
      updatedCount,
      skippedCount,
      focusImportedCount,
      lifeEventImportedCount,
    };
  }

  rollbackImportBatch(batchId: string): void {
    const now = nowSeconds();
    const changes = this.db
      .prepare(
        "SELECT * FROM import_batch_changes WHERE batch_id = ? ORDER BY id DESC",
      )
      .all(batchId) as SqlRow[];
    const run = this.db.transaction(() => {
      for (const change of changes) {
        const table =
          change.entity_type === "focus_session"
            ? "focus_sessions"
            : "life_events";
        if (change.operation === "insert") {
          this.db
            .prepare(
              `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
            )
            .run(now, now, change.entity_id);
        } else if (change.before_json) {
          const before = JSON.parse(String(change.before_json)) as SqlRow;
          this.updateFromObject(table, String(change.entity_id), before);
        }
      }
      this.db
        .prepare("UPDATE import_batches SET rolled_back_at = ? WHERE id = ?")
        .run(now, batchId);
    });
    run();
  }

  private recordImportChange(
    batchId: string,
    entityType: string,
    entityId: string,
    operation: string,
    before: SqlRow | null,
    after: SqlRow | null,
    createdAt: number,
  ): void {
    this.db
      .prepare(
        `INSERT INTO import_batch_changes
         (batch_id, entity_type, entity_id, operation, before_json, after_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        batchId,
        entityType,
        entityId,
        operation,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        createdAt,
      );
  }

  private ensureTomatoCategory(name: string, now: number): void {
    const normalized = normalizedName(name);
    const existing = this.db
      .prepare(
        "SELECT id FROM task_categories WHERE source = 'tomatodo' AND normalized_name = ? AND deleted_at IS NULL",
      )
      .get(normalized);
    if (existing) {
      this.db
        .prepare(
          "UPDATE task_categories SET last_seen_at = ?, is_archived = 0, updated_at = ? WHERE id = ?",
        )
        .run(now, now, (existing as SqlRow).id);
      return;
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO task_categories
         (id, name, normalized_name, color_hex, source, last_seen_at, is_archived,
          created_at, updated_at, device_id, server_revision)
         VALUES (?, ?, ?, '#175CD3', 'tomatodo', ?, 0, ?, ?, 'electron-windows', 0)`,
      )
      .run(id, name, normalized, now, now, now);
  }

  listLifeEvents(): LifeEventRecord[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM life_events WHERE deleted_at IS NULL ORDER BY occurred_at DESC",
        )
        .all() as SqlRow[]
    ).map(asEvent);
  }

  saveLifeEvent(input: LifeEventDraft): string {
    const draft = lifeEventDraftSchema.parse(input);
    const id = draft.id ?? randomUUID();
    const now = nowSeconds();
    const sourceKey = `manual:${id}`;
    this.db
      .prepare(
        `INSERT INTO life_events
         (id, source_key, source, kind, title, occurred_at, note, created_at, updated_at, device_id, server_revision)
         VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, 'electron-windows', 0)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title,
           occurred_at = excluded.occurred_at, note = excluded.note, updated_at = excluded.updated_at, deleted_at = NULL`,
      )
      .run(
        id,
        sourceKey,
        draft.kind,
        draft.title,
        toEpoch(draft.occurredAt),
        draft.note,
        now,
        now,
      );
    this.enqueue(
      "life_event",
      id,
      "upsert",
      this.db
        .prepare("SELECT * FROM life_events WHERE id = ?")
        .get(id) as SqlRow,
    );
    return id;
  }

  removeLifeEvent(id: string): void {
    const now = nowSeconds();
    this.db
      .prepare(
        "UPDATE life_events SET deleted_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(now, now, id);
    this.enqueue("life_event", id, "delete", { id, deleted_at: now });
  }

  dashboardSummary(): DashboardSummary {
    const tasks = this.listTasks();
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const tomorrowStart = todayStart + 86_400_000;
    const weekStart =
      todayStart - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86_400_000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const focus = this.listFocusSessions();
    const minutesAfter = (start: number): number =>
      focus
        .filter((item) => Date.parse(item.startAt) >= start)
        .reduce((sum, item) => sum + Math.max(0, item.durationMinutes), 0);
    const focusByDay = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(todayStart - (6 - index) * 86_400_000);
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        minutes: focus
          .filter((item) => item.startAt.slice(0, 10) === key)
          .reduce((sum, item) => sum + Math.max(0, item.durationMinutes), 0),
      };
    });
    return {
      taskTotal: tasks.length,
      dueToday: tasks.filter(
        (task) =>
          task.dueAt &&
          Date.parse(task.dueAt) >= todayStart &&
          Date.parse(task.dueAt) < tomorrowStart,
      ).length,
      overdue: tasks.filter(
        (task) =>
          task.status !== "done" &&
          task.dueAt &&
          Date.parse(task.dueAt) < todayStart,
      ).length,
      completed: tasks.filter((task) => task.status === "done").length,
      pending: tasks.filter((task) => task.status !== "done").length,
      estimatedMinutes: tasks
        .filter((task) => task.status !== "done")
        .reduce((sum, task) => sum + task.estimatedMinutes, 0),
      focusTodayMinutes: minutesAfter(todayStart),
      focusWeekMinutes: minutesAfter(weekStart),
      focusMonthMinutes: minutesAfter(monthStart),
      focusByDay,
    };
  }

  search(query: string): SearchHit[] {
    const value = query.trim();
    if (!value) return [];
    const pattern = `%${value.replace(/[\\%_]/g, "\\$&")}%`;
    const taskRows = this.db
      .prepare(
        `SELECT id, title, due_at, COALESCE(description_md, '') AS subtitle FROM tasks
         WHERE deleted_at IS NULL AND is_archived = 0 AND external_source IS NULL
           AND (title LIKE ? ESCAPE '\\' OR description_md LIKE ? ESCAPE '\\') LIMIT 20`,
      )
      .all(pattern, pattern) as SqlRow[];
    const noteRows = this.db
      .prepare(
        `SELECT id, title, substr(content_md, 1, 160) AS subtitle FROM notes
         WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR content_md LIKE ? ESCAPE '\\') LIMIT 20`,
      )
      .all(pattern, pattern) as SqlRow[];
    const focusRows = this.db
      .prepare(
        `SELECT id, task_name AS title, COALESCE(reflection, '') AS subtitle FROM focus_sessions
         WHERE deleted_at IS NULL AND (task_name LIKE ? ESCAPE '\\' OR reflection LIKE ? ESCAPE '\\') LIMIT 20`,
      )
      .all(pattern, pattern) as SqlRow[];
    const countdownRows = this.db
      .prepare(
        `SELECT id, title, target_date AS subtitle FROM countdowns
         WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\') LIMIT 20`,
      )
      .all(pattern, pattern) as SqlRow[];
    return [
      ...taskRows.map((row) => ({
        id: String(row.id),
        entityType: (row.due_at == null ? "memo" : "task") as "memo" | "task",
        title: String(row.title),
        subtitle: String(row.subtitle),
      })),
      ...noteRows.map((row) => ({
        id: String(row.id),
        entityType: "note" as const,
        title: String(row.title),
        subtitle: String(row.subtitle),
      })),
      ...focusRows.map((row) => ({
        id: String(row.id),
        entityType: "focus" as const,
        title: String(row.title),
        subtitle: String(row.subtitle),
      })),
      ...countdownRows.map((row) => ({
        id: String(row.id),
        entityType: "countdown" as const,
        title: String(row.title),
        subtitle: String(row.subtitle),
      })),
    ];
  }

  getSettings(): AppSettings {
    const defaults: AppSettings = {
      themeMode: "system",
      uiScale: 100,
      closeToTray: true,
      startMinimized: false,
    };
    const rows = this.db
      .prepare("SELECT key, value_json FROM app_settings")
      .all() as SqlRow[];
    for (const row of rows) {
      try {
        const value = JSON.parse(String(row.value_json)) as unknown;
        if (row.key === "themeMode")
          defaults.themeMode = themeModeSchema.parse(value);
        if (row.key === "uiScale")
          defaults.uiScale = uiScaleSchema.parse(value);
        if (row.key === "closeToTray") defaults.closeToTray = Boolean(value);
        if (row.key === "startMinimized")
          defaults.startMinimized = Boolean(value);
      } catch {
        // Invalid settings are ignored and replaced on the next save.
      }
    }
    return defaults;
  }

  saveSettings(settings: AppSettings): void {
    this.updateSettings(settings);
  }

  updateSettings(settings: Partial<AppSettings>): void {
    const parsed: Partial<AppSettings> = {};
    if (settings.themeMode !== undefined)
      parsed.themeMode = themeModeSchema.parse(settings.themeMode);
    if (settings.uiScale !== undefined)
      parsed.uiScale = uiScaleSchema.parse(settings.uiScale);
    if (settings.closeToTray !== undefined)
      parsed.closeToTray = Boolean(settings.closeToTray);
    if (settings.startMinimized !== undefined)
      parsed.startMinimized = Boolean(settings.startMinimized);
    if (Object.keys(parsed).length === 0) throw new Error("至少修改一项设置");
    const statement = this.db.prepare(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    );
    const run = this.db.transaction(() => {
      for (const [key, value] of Object.entries(parsed))
        statement.run(key, JSON.stringify(value), nowSeconds());
    });
    run();
  }

  saveUiScale(uiScale: AppSettings["uiScale"]): void {
    this.updateSettings({ uiScale });
  }

  exportData(): Record<string, SqlRow[]> {
    return Object.fromEntries(
      dataTables.map((table) => [
        table,
        (this.db.prepare(`SELECT * FROM ${table}`).all() as SqlRow[]).map(
          (row) => this.serializeRow(row),
        ),
      ]),
    );
  }

  restoreData(payload: Record<string, unknown>): void {
    const deleteOrder = [...dataTables].reverse();
    const run = this.db.transaction(() => {
      for (const table of deleteOrder)
        this.db.prepare(`DELETE FROM ${table}`).run();
      for (const table of dataTables) {
        const rows = Array.isArray(payload[table])
          ? (payload[table] as SqlRow[])
          : [];
        for (const row of rows)
          this.insertObject(table, this.deserializeRow(row));
      }
    });
    run();
  }

  entityCounts(): Record<string, number> {
    return Object.fromEntries(
      dataTables.map((table) => [
        table,
        Number(
          (
            this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
              count: number;
            }
          ).count,
        ),
      ]),
    );
  }

  integrityCheck(): string {
    return String(this.db.pragma("integrity_check", { simple: true }));
  }

  private serializeRow(row: SqlRow): SqlRow {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        key.endsWith("_at") && value != null ? toIso(value) : value,
      ]),
    );
  }

  private deserializeRow(row: SqlRow): SqlRow {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        key.endsWith("_at") && typeof value === "string"
          ? toEpoch(value)
          : typeof value === "boolean"
            ? value
              ? 1
              : 0
            : value,
      ]),
    );
  }

  private insertObject(table: string, row: SqlRow): void {
    const allowed = new Set(
      (
        this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string;
        }>
      ).map((item) => item.name),
    );
    const entries = Object.entries(row).filter(([key]) => allowed.has(key));
    if (entries.length === 0) return;
    const columns = entries.map(([key]) => `"${key}"`).join(", ");
    const placeholders = entries.map(() => "?").join(", ");
    this.db
      .prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`)
      .run(...entries.map(([, value]) => bindable(value)));
  }

  private updateFromObject(table: string, id: string, row: SqlRow): void {
    const allowed = new Set(
      (
        this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string;
        }>
      ).map((item) => item.name),
    );
    const entries = Object.entries(row).filter(
      ([key]) => key !== "id" && allowed.has(key),
    );
    if (entries.length === 0) return;
    const assignments = entries.map(([key]) => `"${key}" = ?`).join(", ");
    this.db
      .prepare(`UPDATE ${table} SET ${assignments} WHERE id = ?`)
      .run(...entries.map(([, value]) => bindable(value)), id);
  }

  private enqueue(
    entityType: string,
    entityId: string,
    operation: "upsert" | "delete",
    payload: SqlRow,
  ): void {
    const baseRevision = Number(payload.server_revision ?? 0);
    this.db
      .prepare(
        `INSERT INTO sync_outbox
         (entity_type, entity_id, operation, payload_json, created_at, retry_count,
          operation_id, base_revision, status)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'pending')`,
      )
      .run(
        entityType,
        entityId,
        operation,
        JSON.stringify(payload),
        nowSeconds(),
        randomUUID(),
        baseRevision,
      );
  }
}
