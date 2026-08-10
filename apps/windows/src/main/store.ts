import { createHash, randomUUID } from "node:crypto";
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
  FinanceImportBatchRecord,
  FinanceImportPreview,
  FinanceImportResult,
  FinanceListResult,
  FinanceQuery,
  FinanceTransactionRecord,
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
  TomatoImportRow,
  TomatoPreview,
  TomatoPreviewCounts,
  TomatoRowAction,
} from "../preload/api-types";
import { classifyLifeEvent, normalizeLegacyTomatoText } from "../shared/domain";
import { normalizeTagName, tagColorHex } from "../shared/tag-colors";
import { buildFocusByLocalDay } from "../shared/focus-dates";
import { addLocalDays, localDayStart } from "../shared/local-date";
import { localDateKey, parseLocalDateKey } from "../shared/local-date";
import {
  FINANCE_CATEGORIES,
  classifyFinanceTransaction,
  financeImpactCents,
  type FinanceCategory,
  type FinancePlatform,
} from "../shared/finance";
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
  "finance_transactions",
  "finance_import_batches",
  "import_batches",
  "import_batch_changes",
] as const;

type SqlRow = Record<string, unknown>;

type TomatoEntityType = "focus_session" | "life_event";

interface TomatoEntity {
  entityType: TomatoEntityType;
  row: SqlRow;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function financeEntityId(platform: FinancePlatform, sourceKey: string): string {
  const hex = createHash("sha256")
    .update(`zhixu:finance:${platform}:${sourceKey}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
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

function asFinance(row: SqlRow): FinanceTransactionRecord {
  const analysisKind = String(
    row.analysis_kind,
  ) as FinanceTransactionRecord["analysisKind"];
  const amountCents = Number(row.amount_cents ?? 0);
  const isIncluded = bool(row.is_included);
  const impactReason = classifyFinanceTransaction({
    platform: String(row.platform) as FinancePlatform,
    rawFlow: String(row.raw_flow),
    rawStatus: String(row.raw_status),
    rawType: String(row.raw_type),
    counterparty: String(row.counterparty),
    description: String(row.description),
    paymentMethod: String(row.payment_method),
  }).impactReason;
  return {
    id: String(row.id),
    platform: String(row.platform) as FinancePlatform,
    sourceKey: String(row.source_key),
    transactionId:
      row.transaction_id == null ? null : String(row.transaction_id),
    merchantOrderId:
      row.merchant_order_id == null ? null : String(row.merchant_order_id),
    transactedAt: toIso(row.transacted_at) ?? new Date(0).toISOString(),
    amountCents,
    rawFlow: String(row.raw_flow),
    rawStatus: String(row.raw_status),
    rawType: String(row.raw_type),
    counterparty: String(row.counterparty),
    counterpartyAccount:
      row.counterparty_account == null
        ? null
        : String(row.counterparty_account),
    description: String(row.description),
    paymentMethod: String(row.payment_method),
    rawNote: row.raw_note == null ? null : String(row.raw_note),
    rawPayloadJson: String(row.raw_payload_json),
    analysisKind,
    impactReason,
    category: String(row.category) as FinanceCategory,
    isIncluded,
    note: row.note == null ? null : String(row.note),
    impactCents: financeImpactCents(analysisKind, amountCents, isIncluded),
    importBatchId:
      row.import_batch_id == null ? null : String(row.import_batch_id),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function financeRangeBounds(
  view: FinanceQuery["view"],
  customStart: string | undefined,
  customEnd: string | undefined,
  records: FinanceTransactionRecord[],
  now = new Date(),
): { start: Date | null; end: Date | null; error: string | null } {
  const today = localDayStart(now);
  if (view === "all") {
    const sorted = records
      .map((item) => new Date(item.transactedAt))
      .filter((date) => Number.isFinite(date.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());
    return sorted.length
      ? {
          start: localDayStart(sorted[0]!),
          end: addLocalDays(localDayStart(sorted[sorted.length - 1]!), 1),
          error: null,
        }
      : { start: null, end: null, error: null };
  }
  if (view === "custom") {
    try {
      if (!customStart || !customEnd)
        return { start: null, end: null, error: "请选择完整的起止日期" };
      const start = parseLocalDateKey(customStart);
      const endDate = parseLocalDateKey(customEnd);
      if (start > endDate)
        return { start: null, end: null, error: "结束日期不能早于开始日期" };
      return { start, end: addLocalDays(endDate, 1), error: null };
    } catch {
      return { start: null, end: null, error: "日期范围无效" };
    }
  }
  if (view === "today")
    return { start: today, end: addLocalDays(today, 1), error: null };
  if (view === "week") {
    const start = addLocalDays(today, -((today.getDay() + 6) % 7));
    return { start, end: addLocalDays(start, 7), error: null };
  }
  if (view === "month") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      start,
      end: new Date(today.getFullYear(), today.getMonth() + 1, 1),
      error: null,
    };
  }
  const start = new Date(today.getFullYear(), 0, 1);
  return {
    start,
    end: new Date(today.getFullYear() + 1, 0, 1),
    error: null,
  };
}

function inFinanceRange(
  item: FinanceTransactionRecord,
  bounds: { start: Date | null; end: Date | null },
): boolean {
  const value = Date.parse(item.transactedAt);
  return (
    Number.isFinite(value) &&
    (bounds.start == null || value >= bounds.start.getTime()) &&
    (bounds.end == null || value < bounds.end.getTime())
  );
}

function formatFinanceTrendLabel(key: string, weekly: boolean): string {
  const date = parseLocalDateKey(key);
  return weekly
    ? `${date.getMonth() + 1}/${date.getDate()} 周`
    : `${date.getMonth() + 1}/${date.getDate()}`;
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
  private outboxChanged: (() => void) | null = null;

  constructor(
    private readonly db: Database.Database,
    private readonly deviceId = "electron-windows",
  ) {}

  setOutboxChangedListener(listener: (() => void) | null): void {
    this.outboxChanged = listener;
  }

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
        priority: task.priority,
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
            `UPDATE tasks SET title = ?, description_md = ?, priority = ?, category_id = ?, updated_at = ?,
             deleted_at = NULL, is_archived = 0 WHERE id = ? AND due_at IS NULL`,
          )
          .run(
            draft.title,
            draft.descriptionMd,
            draft.priority,
            draft.categoryId,
            now,
            id,
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO tasks
             (id, title, description_md, status, priority, due_at, estimated_minutes, category_id,
              repeat_rule, completed_at, is_archived, created_at, updated_at, device_id, server_revision)
             VALUES (?, ?, ?, 'todo', ?, NULL, 0, ?, NULL, NULL, 0, ?, ?, 'electron-windows', 0)`,
          )
          .run(
            id,
            draft.title,
            draft.descriptionMd,
            draft.priority,
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

  listFinance(input: FinanceQuery): FinanceListResult {
    const query: FinanceQuery = {
      ...input,
      view: input.view ?? "month",
      inclusion: input.inclusion ?? "all",
      sort: input.sort ?? "time_desc",
      cursor: Math.max(0, input.cursor ?? 0),
      limit: Math.min(200, Math.max(20, input.limit ?? 100)),
    };
    const all = (
      this.db
        .prepare(
          "SELECT * FROM finance_transactions WHERE deleted_at IS NULL ORDER BY transacted_at DESC",
        )
        .all() as SqlRow[]
    ).map(asFinance);
    const facets = {
      statuses: [
        ...new Set(all.map((item) => item.rawStatus).filter(Boolean)),
      ].sort(),
      types: [
        ...new Set(all.map((item) => item.rawType).filter(Boolean)),
      ].sort(),
      paymentMethods: [
        ...new Set(all.map((item) => item.paymentMethod).filter(Boolean)),
      ].sort(),
    };
    const search = query.search?.trim().toLocaleLowerCase("zh-CN") ?? "";
    const base = all.filter((item) => {
      if (query.platforms?.length && !query.platforms.includes(item.platform))
        return false;
      if (query.categories?.length && !query.categories.includes(item.category))
        return false;
      if (query.inclusion === "included" && !item.isIncluded) return false;
      if (query.inclusion === "excluded" && item.isIncluded) return false;
      if (query.impact === "positive" && item.impactCents <= 0) return false;
      if (query.impact === "negative" && item.impactCents >= 0) return false;
      if (query.impact === "zero" && item.impactCents !== 0) return false;
      if (query.statuses?.length && !query.statuses.includes(item.rawStatus))
        return false;
      if (query.types?.length && !query.types.includes(item.rawType))
        return false;
      if (
        query.paymentMethods?.length &&
        !query.paymentMethods.includes(item.paymentMethod)
      )
        return false;
      if (
        query.minAmountCents !== undefined &&
        item.amountCents < query.minAmountCents
      )
        return false;
      if (
        query.maxAmountCents !== undefined &&
        item.amountCents > query.maxAmountCents
      )
        return false;
      if (search) {
        const haystack = [
          item.counterparty,
          item.description,
          item.rawNote ?? "",
          item.note ?? "",
          item.transactionId ?? "",
        ]
          .join(" ")
          .toLocaleLowerCase("zh-CN");
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    const countFor = (view: FinanceQuery["view"]): number => {
      const bounds = financeRangeBounds(
        view,
        query.customStart,
        query.customEnd,
        base,
      );
      return bounds.error
        ? 0
        : base.filter((item) => inFinanceRange(item, bounds)).length;
    };
    const bounds = financeRangeBounds(
      query.view,
      query.customStart,
      query.customEnd,
      base,
    );
    const filtered = bounds.error
      ? []
      : base.filter((item) => inFinanceRange(item, bounds));
    const netCents = filtered.reduce((sum, item) => sum + item.impactCents, 0);
    const consumptionDays = new Set(
      filtered
        .filter((item) => item.impactCents > 0)
        .map((item) => localDateKey(new Date(item.transactedAt))),
    ).size;
    const dayCount =
      bounds.start && bounds.end
        ? Math.max(
            1,
            Math.round(
              (bounds.end.getTime() - bounds.start.getTime()) / 86_400_000,
            ),
          )
        : 0;
    const todayBounds = financeRangeBounds("today", undefined, undefined, base);
    const monthBounds = financeRangeBounds("month", undefined, undefined, base);
    const netForBounds = (range: {
      start: Date | null;
      end: Date | null;
    }): number =>
      base
        .filter((item) => inFinanceRange(item, range))
        .reduce((sum, item) => sum + item.impactCents, 0);

    const spanDays = dayCount;
    const weekly = spanDays > 120;
    const trendGroups = new Map<string, number>();
    for (const item of filtered) {
      const date = localDayStart(new Date(item.transactedAt));
      const groupedDate = weekly
        ? addLocalDays(date, -((date.getDay() + 6) % 7))
        : date;
      const key = localDateKey(groupedDate);
      trendGroups.set(key, (trendGroups.get(key) ?? 0) + item.impactCents);
    }
    const trend = [] as FinanceListResult["overview"]["trend"];
    if (bounds.start && bounds.end) {
      const step = weekly ? 7 : 1;
      let cursor = weekly
        ? addLocalDays(bounds.start, -((bounds.start.getDay() + 6) % 7))
        : bounds.start;
      while (cursor < bounds.end) {
        const key = localDateKey(cursor);
        trend.push({
          key,
          label: formatFinanceTrendLabel(key, weekly),
          impactCents: trendGroups.get(key) ?? 0,
        });
        cursor = addLocalDays(cursor, step);
      }
    }
    const categoryMap = new Map<FinanceCategory, number>();
    const platformMap = new Map<FinancePlatform, number>();
    for (const item of filtered) {
      categoryMap.set(
        item.category,
        (categoryMap.get(item.category) ?? 0) + item.impactCents,
      );
      platformMap.set(
        item.platform,
        (platformMap.get(item.platform) ?? 0) + item.impactCents,
      );
    }
    const sorted = [...filtered].sort((left, right) => {
      if (query.sort === "time_asc")
        return Date.parse(left.transactedAt) - Date.parse(right.transactedAt);
      if (query.sort === "amount_desc")
        return right.amountCents - left.amountCents;
      if (query.sort === "amount_asc")
        return left.amountCents - right.amountCents;
      return Date.parse(right.transactedAt) - Date.parse(left.transactedAt);
    });
    const offset = query.cursor ?? 0;
    const limit = query.limit ?? 100;
    const records = sorted.slice(offset, offset + limit);
    return {
      records,
      nextCursor:
        offset + records.length < sorted.length
          ? offset + records.length
          : null,
      totalCount: sorted.length,
      range: {
        start: bounds.start ? localDateKey(bounds.start) : null,
        end: bounds.end ? localDateKey(addLocalDays(bounds.end, -1)) : null,
      },
      rangeError: bounds.error,
      viewCounts: {
        today: countFor("today"),
        week: countFor("week"),
        month: countFor("month"),
        year: countFor("year"),
        all: countFor("all"),
        custom: countFor("custom"),
      },
      metrics: {
        netCents,
        includedCount: filtered.filter((item) => item.isIncluded).length,
        consumptionDays,
        dailyAverageCents: dayCount > 0 ? Math.round(netCents / dayCount) : 0,
        monthNetCents: netForBounds(monthBounds),
        todayNetCents: netForBounds(todayBounds),
      },
      overview: {
        trend,
        categories: FINANCE_CATEGORIES.map((category) => ({
          category,
          impactCents: categoryMap.get(category) ?? 0,
        })).filter((item) => item.impactCents !== 0),
        platforms: (["alipay", "wechat"] as const).map((platform) => ({
          platform,
          impactCents: platformMap.get(platform) ?? 0,
        })),
      },
      facets,
    };
  }

  updateFinance(input: {
    id: string;
    isIncluded?: boolean;
    category?: FinanceCategory;
    note?: string | null;
  }): void {
    const existing = this.db
      .prepare(
        "SELECT * FROM finance_transactions WHERE id = ? AND deleted_at IS NULL",
      )
      .get(input.id) as SqlRow | undefined;
    if (!existing) throw new Error("消费记录不存在");
    const category = input.category ?? String(existing.category);
    if (!FINANCE_CATEGORIES.includes(category as FinanceCategory))
      throw new Error("消费分类无效");
    const note =
      input.note === undefined ? existing.note : input.note?.trim() || null;
    if (typeof note === "string" && note.length > 10_000)
      throw new Error("备注不能超过 10000 个字符");
    const updated = {
      ...existing,
      is_included:
        input.isIncluded === undefined
          ? Number(existing.is_included)
          : input.isIncluded
            ? 1
            : 0,
      category,
      note,
      updated_at: nowSeconds(),
    };
    this.updateFromObject("finance_transactions", input.id, updated);
    this.enqueue("finance_transaction", input.id, "upsert", updated);
  }

  previewFinanceImport(preview: FinanceImportPreview): FinanceImportPreview {
    const keys = new Set(
      (
        this.db
          .prepare("SELECT platform, source_key FROM finance_transactions")
          .all() as SqlRow[]
      ).map((row) => `${String(row.platform)}:${String(row.source_key)}`),
    );
    const seen = new Set<string>();
    const rows = preview.rows.map((row) => {
      if (row.action === "error") return row;
      const key = `${row.platform}:${row.sourceKey}`;
      const duplicate = keys.has(key) || seen.has(key);
      seen.add(key);
      return {
        ...row,
        action: duplicate ? ("duplicate" as const) : ("create" as const),
        reason: duplicate ? "该账单记录已导入" : row.reason,
      };
    });
    const files = preview.files.map((file) => {
      const fileRows = rows.filter((row) => row.fileHash === file.fileHash);
      return {
        ...file,
        newCount: fileRows.filter((row) => row.action === "create").length,
        duplicateCount: fileRows.filter((row) => row.action === "duplicate")
          .length,
        excludedCount: fileRows.filter(
          (row) => row.action !== "error" && !row.isIncluded,
        ).length,
        positiveCount: fileRows.filter(
          (row) =>
            row.action !== "error" &&
            (row.analysisKind === "expense" ||
              row.analysisKind === "transfer_out"),
        ).length,
        negativeCount: fileRows.filter(
          (row) =>
            row.action !== "error" &&
            (row.analysisKind === "income" || row.analysisKind === "refund"),
        ).length,
        zeroCount: fileRows.filter(
          (row) => row.action !== "error" && row.analysisKind === "neutral",
        ).length,
        errorCount: fileRows.filter((row) => row.action === "error").length,
      };
    });
    const counts = {
      source: rows.length,
      create: rows.filter((row) => row.action === "create").length,
      duplicate: rows.filter((row) => row.action === "duplicate").length,
      excluded: rows.filter((row) => row.action !== "error" && !row.isIncluded)
        .length,
      positive: rows.filter(
        (row) =>
          row.action !== "error" &&
          (row.analysisKind === "expense" ||
            row.analysisKind === "transfer_out"),
      ).length,
      negative: rows.filter(
        (row) =>
          row.action !== "error" &&
          (row.analysisKind === "income" || row.analysisKind === "refund"),
      ).length,
      zero: rows.filter(
        (row) => row.action !== "error" && row.analysisKind === "neutral",
      ).length,
      error: rows.filter((row) => row.action === "error").length,
    };
    return { ...preview, rows, files, counts, canCommit: counts.error === 0 };
  }

  importFinance(preview: FinanceImportPreview): FinanceImportResult {
    const checked = this.previewFinanceImport(preview);
    if (!checked.canCommit) throw new Error("导入预检存在错误，无法提交");
    const batchIds: string[] = [];
    let importedCount = 0;
    const run = this.db.transaction(() => {
      for (const file of checked.files) {
        const batchId = randomUUID();
        batchIds.push(batchId);
        const fileRows = checked.rows.filter(
          (row) => row.fileHash === file.fileHash,
        );
        this.db
          .prepare(
            `INSERT INTO finance_import_batches
             (id, file_name, file_hash, platform, range_start, range_end,
              source_count, imported_count, duplicate_count, excluded_count,
              error_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            batchId,
            file.fileName,
            file.fileHash,
            file.platform,
            toEpoch(file.rangeStart),
            toEpoch(file.rangeEnd),
            file.sourceCount,
            file.newCount,
            file.duplicateCount,
            file.excludedCount,
            file.errorCount,
            nowSeconds(),
          );
        for (const row of fileRows) {
          if (row.action !== "create") continue;
          const id = financeEntityId(row.platform, row.sourceKey);
          const now = nowSeconds();
          const entity: SqlRow = {
            id,
            platform: row.platform,
            source_key: row.sourceKey,
            transaction_id: row.transactionId,
            merchant_order_id: row.merchantOrderId,
            transacted_at: toEpoch(row.transactedAt),
            amount_cents: row.amountCents,
            raw_flow: row.rawFlow,
            raw_status: row.rawStatus,
            raw_type: row.rawType,
            counterparty: row.counterparty,
            counterparty_account: row.counterpartyAccount,
            description: row.description,
            payment_method: row.paymentMethod,
            raw_note: row.rawNote,
            raw_payload_json: row.rawPayloadJson,
            analysis_kind: row.analysisKind,
            category: row.category,
            is_included: row.isIncluded ? 1 : 0,
            note: null,
            import_batch_id: batchId,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            device_id: this.deviceId,
            server_revision: 0,
          };
          this.insertObject("finance_transactions", entity);
          this.enqueue("finance_transaction", id, "upsert", entity);
          importedCount += 1;
        }
      }
    });
    run();
    return {
      batchIds,
      importedCount,
      duplicateCount: checked.counts.duplicate,
      excludedCount: checked.counts.excluded,
    };
  }

  listFinanceImportBatches(): FinanceImportBatchRecord[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM finance_import_batches ORDER BY created_at DESC",
        )
        .all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      fileName: String(row.file_name),
      fileHash: String(row.file_hash),
      platform: String(row.platform) as FinancePlatform,
      rangeStart: toIso(row.range_start),
      rangeEnd: toIso(row.range_end),
      sourceCount: Number(row.source_count),
      importedCount: Number(row.imported_count),
      duplicateCount: Number(row.duplicate_count),
      excludedCount: Number(row.excluded_count),
      errorCount: Number(row.error_count),
      createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    }));
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

  previewTomatoImport(preview: TomatoPreview): TomatoPreview {
    const rows = preview.rows.map((row) => ({
      ...row,
      action: this.tomatoRowAction(row),
    }));
    const counts: TomatoPreviewCounts = {
      create: 0,
      update: 0,
      unchanged: 0,
      reconcile: 0,
      excluded: 0,
      error: 0,
    };
    for (const row of rows) counts[row.action] += 1;
    return {
      ...preview,
      rows,
      counts,
      canCommit: counts.error === 0 && rows.length > 0,
    };
  }

  importTomato(input: TomatoPreview): ImportResult {
    const preview = this.previewTomatoImport(input);
    if (!preview.canCommit) throw new Error("导入预检包含错误，无法提交");

    const batchId = randomUUID();
    const now = nowSeconds();
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let focusImportedCount = 0;
    let lifeEventImportedCount = 0;
    let reconciledCount = 0;
    let excludedCount = 0;

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

      for (const row of preview.rows) {
        const action = this.tomatoRowAction(row);
        if (action === "error")
          throw new Error(
            `第 ${row.sourceRow} 行预检失败：${row.reason ?? "未知错误"}`,
          );
        if (row.classification === "excluded") excludedCount += 1;
        if (action === "excluded") continue;
        if (action === "unchanged") {
          skippedCount += 1;
          continue;
        }

        const targetType = this.tomatoTargetType(row);
        const entities = this.findTomatoEntities(row);
        if (action === "reconcile") {
          const keep = targetType
            ? entities.find((entity) => entity.entityType === targetType)
            : undefined;
          for (const entity of entities) {
            if (
              keep &&
              entity.entityType === keep.entityType &&
              entity.row.id === keep.row.id
            )
              continue;
            if (entity.row.deleted_at == null)
              this.softDeleteTomatoEntity(batchId, entity, now);
          }
          if (targetType) this.upsertTomatoRow(batchId, row, keep, now);
          reconciledCount += 1;
          continue;
        }

        if (!targetType)
          throw new Error(`第 ${row.sourceRow} 行缺少可导入的记录类型`);
        const existing = entities.find(
          (entity) => entity.entityType === targetType,
        );
        const inserted = this.upsertTomatoRow(batchId, row, existing, now);
        if (inserted) {
          importedCount += 1;
          if (targetType === "focus_session") focusImportedCount += 1;
          else lifeEventImportedCount += 1;
        } else {
          updatedCount += 1;
        }
      }
      this.db
        .prepare(
          "UPDATE import_batches SET imported_count = ?, skipped_count = ? WHERE id = ?",
        )
        .run(
          importedCount + updatedCount + reconciledCount,
          skippedCount + excludedCount,
          batchId,
        );
    });
    run();
    return {
      importedCount,
      updatedCount,
      skippedCount,
      focusImportedCount,
      lifeEventImportedCount,
      reconciledCount,
      excludedCount,
      errorCount: 0,
    };
  }

  private tomatoTargetType(row: TomatoImportRow): TomatoEntityType | null {
    if (row.classification === "focus") return "focus_session";
    if (row.classification === "life_event") return "life_event";
    return null;
  }

  private findTomatoEntities(row: TomatoImportRow): TomatoEntity[] {
    if (!row.sourceKey) return [];
    const alias = row.legacySourceKey ?? row.sourceKey;
    const collect = (
      table: "focus_sessions" | "life_events",
      entityType: TomatoEntityType,
    ): TomatoEntity[] =>
      (
        this.db
          .prepare(
            `SELECT * FROM ${table}
             WHERE source = 'tomatodo' AND source_key IN (?, ?)
             ORDER BY CASE WHEN source_key = ? THEN 0 ELSE 1 END,
                      CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END,
                      updated_at DESC`,
          )
          .all(row.sourceKey, alias, row.sourceKey) as SqlRow[]
      ).map((value) => ({ entityType, row: value }));
    return [
      ...collect("focus_sessions", "focus_session"),
      ...collect("life_events", "life_event"),
    ];
  }

  private tomatoRowAction(row: TomatoImportRow): TomatoRowAction {
    if (row.classification === "error") return "error";
    const entities = this.findTomatoEntities(row);
    const active = entities.filter((entity) => entity.row.deleted_at == null);
    const targetType = this.tomatoTargetType(row);
    if (!targetType) return active.length > 0 ? "reconcile" : "excluded";

    const targets = entities.filter(
      (entity) => entity.entityType === targetType,
    );
    const target = targets[0];
    const extraActive = active.some(
      (entity) =>
        !target ||
        entity.entityType !== target.entityType ||
        entity.row.id !== target.row.id,
    );
    if (!target) return active.length > 0 ? "reconcile" : "create";
    if (extraActive) return "reconcile";
    return this.tomatoEntityMatches(target, row) ? "unchanged" : "update";
  }

  private tomatoEntityMatches(
    entity: TomatoEntity,
    row: TomatoImportRow,
  ): boolean {
    if (!row.sourceKey || !row.startAt || row.durationMinutes == null)
      return false;
    if (entity.row.deleted_at != null) return false;
    if (entity.entityType === "focus_session") {
      return (
        String(entity.row.source_key) === row.sourceKey &&
        String(entity.row.task_name) === row.taskName.trim() &&
        Number(entity.row.start_at) === toEpoch(row.startAt) &&
        Number(entity.row.end_at) === toEpoch(row.endAt) &&
        Number(entity.row.duration_minutes) === row.durationMinutes &&
        (entity.row.reflection == null
          ? null
          : String(entity.row.reflection)) === row.reflection &&
        String(entity.row.status) === row.status
      );
    }
    return (
      String(entity.row.source_key) === row.sourceKey &&
      String(entity.row.kind) === classifyLifeEvent(row.taskName) &&
      String(entity.row.title) === row.taskName.trim() &&
      Number(entity.row.occurred_at) === toEpoch(row.startAt) &&
      (entity.row.note == null ? null : String(entity.row.note)) ===
        row.reflection
    );
  }

  private upsertTomatoRow(
    batchId: string,
    row: TomatoImportRow,
    existing: TomatoEntity | undefined,
    now: number,
  ): boolean {
    if (
      !row.sourceKey ||
      !row.startAt ||
      !row.endAt ||
      row.durationMinutes == null
    )
      throw new Error(`第 ${row.sourceRow} 行缺少导入字段`);
    const taskName = normalizeLegacyTomatoText(row.taskName).trim();
    const targetType = this.tomatoTargetType(row);
    if (!targetType) throw new Error(`第 ${row.sourceRow} 行没有目标记录类型`);

    if (targetType === "focus_session") {
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
            row.sourceKey,
            toEpoch(row.startAt),
            toEpoch(row.endAt),
            taskName,
            row.durationMinutes,
            row.reflection,
            row.status,
            batchId,
            now,
            now,
          );
        const after = this.db
          .prepare("SELECT * FROM focus_sessions WHERE id = ?")
          .get(id) as SqlRow;
        this.recordImportChange(
          batchId,
          targetType,
          id,
          "insert",
          null,
          after,
          now,
        );
        this.enqueue(targetType, id, "upsert", after);
        this.ensureTomatoCategory(taskName, now);
        return true;
      }
      const before = { ...existing.row };
      this.db
        .prepare(
          `UPDATE focus_sessions SET source_key = ?, task_name = ?, start_at = ?, end_at = ?,
           duration_minutes = ?, reflection = ?, status = ?, import_batch_id = ?, updated_at = ?, deleted_at = NULL
           WHERE id = ?`,
        )
        .run(
          row.sourceKey,
          taskName,
          toEpoch(row.startAt),
          toEpoch(row.endAt),
          row.durationMinutes,
          row.reflection,
          row.status,
          batchId,
          now,
          existing.row.id,
        );
      const after = this.db
        .prepare("SELECT * FROM focus_sessions WHERE id = ?")
        .get(existing.row.id) as SqlRow;
      this.recordImportChange(
        batchId,
        targetType,
        String(existing.row.id),
        "update",
        before,
        after,
        now,
      );
      this.enqueue(targetType, String(existing.row.id), "upsert", after);
      this.ensureTomatoCategory(taskName, now);
      return false;
    }

    const kind = classifyLifeEvent(taskName);
    if (!existing) {
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
          row.sourceKey,
          kind,
          taskName,
          toEpoch(row.startAt),
          row.reflection,
          batchId,
          now,
          now,
        );
      const after = this.db
        .prepare("SELECT * FROM life_events WHERE id = ?")
        .get(id) as SqlRow;
      this.recordImportChange(
        batchId,
        targetType,
        id,
        "insert",
        null,
        after,
        now,
      );
      this.enqueue(targetType, id, "upsert", after);
      return true;
    }
    const before = { ...existing.row };
    this.db
      .prepare(
        `UPDATE life_events SET source_key = ?, kind = ?, title = ?, occurred_at = ?, note = ?,
         import_batch_id = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`,
      )
      .run(
        row.sourceKey,
        kind,
        taskName,
        toEpoch(row.startAt),
        row.reflection,
        batchId,
        now,
        existing.row.id,
      );
    const after = this.db
      .prepare("SELECT * FROM life_events WHERE id = ?")
      .get(existing.row.id) as SqlRow;
    this.recordImportChange(
      batchId,
      targetType,
      String(existing.row.id),
      "update",
      before,
      after,
      now,
    );
    this.enqueue(targetType, String(existing.row.id), "upsert", after);
    return false;
  }

  private softDeleteTomatoEntity(
    batchId: string,
    entity: TomatoEntity,
    now: number,
  ): void {
    const table =
      entity.entityType === "focus_session" ? "focus_sessions" : "life_events";
    const before = { ...entity.row };
    this.db
      .prepare(
        `UPDATE ${table} SET deleted_at = ?, import_batch_id = ?, updated_at = ? WHERE id = ?`,
      )
      .run(now, batchId, now, entity.row.id);
    const after = this.db
      .prepare(`SELECT * FROM ${table} WHERE id = ?`)
      .get(entity.row.id) as SqlRow;
    this.recordImportChange(
      batchId,
      entity.entityType,
      String(entity.row.id),
      "update",
      before,
      after,
      now,
    );
    this.enqueue(entity.entityType, String(entity.row.id), "delete", {
      id: String(entity.row.id),
      deleted_at: now,
      server_revision: entity.row.server_revision ?? 0,
    });
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
          this.enqueue(
            String(change.entity_type),
            String(change.entity_id),
            "delete",
            {
              id: String(change.entity_id),
              deleted_at: now,
            },
          );
        } else if (change.before_json) {
          const before = JSON.parse(String(change.before_json)) as SqlRow;
          this.updateFromObject(table, String(change.entity_id), before);
          const restored = this.db
            .prepare(`SELECT * FROM ${table} WHERE id = ?`)
            .get(change.entity_id) as SqlRow;
          if (restored.deleted_at == null) {
            this.enqueue(
              String(change.entity_type),
              String(change.entity_id),
              "upsert",
              restored,
            );
          } else {
            this.enqueue(
              String(change.entity_type),
              String(change.entity_id),
              "delete",
              {
                id: String(change.entity_id),
                deleted_at: restored.deleted_at,
                server_revision: restored.server_revision ?? 0,
              },
            );
          }
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
      const id = String((existing as SqlRow).id);
      this.db
        .prepare(
          "UPDATE task_categories SET last_seen_at = ?, is_archived = 0, updated_at = ? WHERE id = ?",
        )
        .run(now, now, id);
      this.enqueue(
        "task_category",
        id,
        "upsert",
        this.db
          .prepare("SELECT * FROM task_categories WHERE id = ?")
          .get(id) as SqlRow,
      );
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
    this.enqueue(
      "task_category",
      id,
      "upsert",
      this.db
        .prepare("SELECT * FROM task_categories WHERE id = ?")
        .get(id) as SqlRow,
    );
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
    const today = localDayStart(now);
    const todayStart = today.getTime();
    const tomorrowStart = addLocalDays(today, 1).getTime();
    const weekStart = addLocalDays(today, -6).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const focus = this.listFocusSessions();
    const minutesInPeriod = (start: number): number =>
      focus
        .filter((item) => {
          const value = Date.parse(item.startAt);
          return value >= start && value < tomorrowStart;
        })
        .reduce((sum, item) => sum + Math.max(0, item.durationMinutes), 0);
    const focusByDay = buildFocusByLocalDay(focus, 7, now);
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
      focusTodayMinutes: minutesInPeriod(todayStart),
      focusWeekMinutes: minutesInPeriod(weekStart),
      focusMonthMinutes: minutesInPeriod(monthStart),
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

  rebuildSyncOutbox(previous?: Record<string, unknown>): void {
    const entities = {
      task_categories: "task_category",
      tags: "tag",
      tasks: "task",
      tag_links: "tag_link",
      notes: "note",
      schedule_blocks: "schedule_block",
      focus_sessions: "focus_session",
      life_events: "life_event",
      countdowns: "countdown",
      finance_transactions: "finance_transaction",
    } as const;
    const now = nowSeconds();
    const run = this.db.transaction(() => {
      this.db.prepare("DELETE FROM sync_outbox").run();
      for (const [table, entityType] of Object.entries(entities)) {
        const currentRows = this.db
          .prepare(`SELECT * FROM ${table}`)
          .all() as SqlRow[];
        const currentIds = new Set(currentRows.map((row) => String(row.id)));
        for (const row of currentRows)
          this.enqueue(
            entityType,
            String(row.id),
            row.deleted_at == null ? "upsert" : "delete",
            row,
          );
        const oldRows = Array.isArray(previous?.[table])
          ? (previous[table] as SqlRow[])
          : [];
        for (const row of oldRows) {
          if (currentIds.has(String(row.id))) continue;
          this.enqueue(entityType, String(row.id), "delete", {
            id: row.id,
            deleted_at: now,
            updated_at: now,
            server_revision: row.server_revision ?? 0,
          });
        }
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
    const table = {
      task_category: "task_categories",
      tag: "tags",
      task: "tasks",
      tag_link: "tag_links",
      note: "notes",
      schedule_block: "schedule_blocks",
      focus_session: "focus_sessions",
      life_event: "life_events",
      countdown: "countdowns",
      finance_transaction: "finance_transactions",
    }[entityType];
    if (table)
      this.db
        .prepare(`UPDATE ${table} SET device_id = ? WHERE id = ?`)
        .run(this.deviceId, entityId);
    const normalizedPayload = {
      ...payload,
      ...(table ? { device_id: this.deviceId } : {}),
      ...(operation === "delete" && payload.updated_at === undefined
        ? { updated_at: payload.deleted_at ?? nowSeconds() }
        : {}),
    };
    this.db
      .prepare(
        `INSERT INTO sync_outbox
         (entity_type, entity_id, operation, payload_json, created_at, retry_count,
          last_error, operation_id, base_revision, status)
         VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, 'pending')
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           operation = excluded.operation, payload_json = excluded.payload_json,
           created_at = excluded.created_at, retry_count = 0, last_error = NULL,
           operation_id = excluded.operation_id,
           base_revision = MAX(sync_outbox.base_revision, excluded.base_revision),
           status = 'pending'`,
      )
      .run(
        entityType,
        entityId,
        operation,
        JSON.stringify(normalizedPayload),
        nowSeconds(),
        randomUUID(),
        baseRevision,
      );
    queueMicrotask(() => this.outboxChanged?.());
  }
}
