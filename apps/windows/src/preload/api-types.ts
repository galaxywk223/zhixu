import type {
  CountdownDraft,
  LifeEventDraft,
  MemoDraft,
  NoteDraft,
  TaskBatchDraft,
  TaskDraft,
  ThemeMode,
  UiScale,
} from "@zhixu/contracts";

export interface TaskRecord {
  id: string;
  title: string;
  descriptionMd: string | null;
  status: "todo" | "in_progress" | "done";
  priority: number;
  dueAt: string | null;
  estimatedMinutes: number;
  categoryId: string | null;
  repeatRule: string | null;
  completedAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  tagIds: string[];
}

export interface MemoRecord {
  id: string;
  title: string;
  descriptionMd: string | null;
  priority: number;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  tagIds: string[];
}

export interface CountdownRecord {
  id: string;
  title: string;
  targetDate: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskBatchResult {
  primaryId: string;
  createdCount: number;
  ids: string[];
}

export interface CategoryRecord {
  id: string;
  name: string;
  colorHex: string;
  source: string;
  isArchived: boolean;
}

export interface TagRecord {
  id: string;
  name: string;
  colorHex: string;
  isArchived: boolean;
}

export interface NoteRecord {
  id: string;
  title: string;
  contentMd: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleBlockRecord {
  id: string;
  title: string;
  taskId: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  colorHex: string;
}

export interface FocusSessionRecord {
  id: string;
  sourceKey: string;
  startAt: string;
  endAt: string;
  taskName: string;
  durationMinutes: number;
  reflection: string | null;
  status: string;
  importBatchId: string | null;
}

export interface LifeEventRecord {
  id: string;
  sourceKey: string;
  source: string;
  kind: "sleep" | "wake" | "other";
  title: string;
  occurredAt: string;
  note: string | null;
  importBatchId: string | null;
}

export interface ImportBatchRecord {
  id: string;
  fileName: string;
  fileHash: string;
  exportUser: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  declaredMinutes: number | null;
  declaredRecords: number | null;
  importedCount: number;
  skippedCount: number;
  errorMessage: string | null;
  createdAt: string;
  rolledBackAt: string | null;
}

export interface TomatoPreview {
  token: string;
  fileName: string;
  fileHash: string;
  exportUser: string | null;
  declaredMinutes: number | null;
  declaredRecords: number | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  calculatedMinutes: number;
  focusCount: number;
  lifeEventCount: number;
  counts: TomatoPreviewCounts;
  canCommit: boolean;
  rows: TomatoImportRow[];
}

export type TomatoRowClassification =
  "focus" | "life_event" | "excluded" | "error";

export type TomatoRowAction =
  "create" | "update" | "unchanged" | "reconcile" | "excluded" | "error";

export interface TomatoPreviewCounts {
  create: number;
  update: number;
  unchanged: number;
  reconcile: number;
  excluded: number;
  error: number;
}

export interface TomatoImportRow {
  sourceRow: number;
  sourceKey: string | null;
  legacySourceKey: string | null;
  startAt: string | null;
  endAt: string | null;
  taskName: string;
  durationMinutes: number | null;
  reflection: string | null;
  status: string;
  classification: TomatoRowClassification;
  action: TomatoRowAction;
  reason: string | null;
  warnings: string[];
}

export interface ImportResult {
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  focusImportedCount: number;
  lifeEventImportedCount: number;
  reconciledCount: number;
  excludedCount: number;
  errorCount: number;
}

export interface DashboardSummary {
  taskTotal: number;
  dueToday: number;
  overdue: number;
  completed: number;
  pending: number;
  estimatedMinutes: number;
  focusTodayMinutes: number;
  focusWeekMinutes: number;
  focusMonthMinutes: number;
  focusByDay: Array<{ date: string; minutes: number }>;
}

export interface SearchHit {
  id: string;
  entityType: "task" | "memo" | "countdown" | "note" | "focus";
  title: string;
  subtitle: string;
}

export interface AppSettings {
  themeMode: ThemeMode;
  uiScale: UiScale;
  closeToTray: boolean;
  startMinimized: boolean;
}

export interface MigrationReport {
  status: "fresh" | "migrated" | "current";
  sourcePath: string | null;
  sourceHash: string | null;
  backupPath: string | null;
  fromVersion: number;
  toVersion: 7;
  integrity: string;
  entityCounts: Record<string, number>;
}

export interface UpdateState {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "current"
    | "error";
  version: string | null;
  progress: number;
  message: string | null;
}

export interface ZhixuApi {
  app: {
    bootstrap(): Promise<{
      version: string;
      migration: MigrationReport;
      settings: AppSettings;
    }>;
    onDataChanged(listener: (scope: string) => void): () => void;
    onNavigate(listener: (route: string) => void): () => void;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  tasks: {
    list(): Promise<TaskRecord[]>;
    save(draft: TaskDraft): Promise<string>;
    createBatch(draft: TaskBatchDraft): Promise<TaskBatchResult>;
    setStatus(id: string, status: TaskRecord["status"]): Promise<void>;
    remove(id: string): Promise<void>;
    categories(): Promise<CategoryRecord[]>;
    tags(): Promise<TagRecord[]>;
    saveTag(input: { id?: string; name: string }): Promise<string>;
    removeTag(id: string): Promise<void>;
  };
  memos: {
    list(): Promise<MemoRecord[]>;
    save(draft: MemoDraft): Promise<string>;
    remove(id: string): Promise<void>;
  };
  countdowns: {
    list(): Promise<CountdownRecord[]>;
    save(draft: CountdownDraft): Promise<string>;
    remove(id: string): Promise<void>;
  };
  notes: {
    list(): Promise<NoteRecord[]>;
    save(draft: NoteDraft): Promise<string>;
    remove(id: string): Promise<void>;
  };
  focus: {
    list(): Promise<FocusSessionRecord[]>;
    batches(): Promise<ImportBatchRecord[]>;
    preview(): Promise<TomatoPreview | null>;
    previewDropped(file: File): Promise<TomatoPreview>;
    confirm(token: string): Promise<ImportResult>;
    rollback(batchId: string): Promise<void>;
  };
  sleep: {
    events(): Promise<LifeEventRecord[]>;
    save(draft: LifeEventDraft): Promise<string>;
    remove(id: string): Promise<void>;
  };
  dashboard: {
    summary(): Promise<DashboardSummary>;
  };
  search: {
    query(value: string): Promise<SearchHit[]>;
  };
  backup: {
    export(): Promise<string | null>;
    restore(): Promise<boolean>;
    restoreDropped(file: File): Promise<boolean>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(settings: Partial<AppSettings>): Promise<void>;
  };
  updates: {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<void>;
    install(): Promise<void>;
    onState(listener: (state: UpdateState) => void): () => void;
  };
  sync: {
    getState(): Promise<{ status: "deferred"; message: string }>;
  };
}

declare global {
  interface Window {
    zhixu: ZhixuApi;
  }
}
