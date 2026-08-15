import type {
  CountdownDraft,
  LifeEventDraft,
  MemoDraft,
  TaskBatchDraft,
  TaskDraft,
  TaskRecurrence,
  TaskSeriesDraft,
  ThemeMode,
  UiScale,
} from "@zhixu/contracts";
import type {
  FinanceAnalysisKind,
  FinanceCategory,
  FinanceImpactReason,
  FinancePlatform,
} from "../shared/finance";

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
  series?: (TaskRecurrence & { id: string }) | null;
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

export interface TaskSeriesResult {
  seriesId: string;
  updatedCount: number;
  createdCount: number;
  removedCount: number;
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

export type FinanceView =
  "today" | "week" | "month" | "year" | "all" | "custom";
export type FinanceTrendGranularity = "day" | "week" | "month";

export interface FinanceTransactionRecord {
  id: string;
  platform: FinancePlatform;
  sourceKey: string;
  transactionId: string | null;
  merchantOrderId: string | null;
  transactedAt: string;
  amountCents: number;
  rawFlow: string;
  rawStatus: string;
  rawType: string;
  counterparty: string;
  counterpartyAccount: string | null;
  description: string;
  paymentMethod: string;
  rawNote: string | null;
  rawPayloadJson: string;
  analysisKind: FinanceAnalysisKind;
  impactReason: FinanceImpactReason;
  category: FinanceCategory;
  isIncluded: boolean;
  note: string | null;
  impactCents: number;
  importBatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceQuery {
  view: FinanceView;
  trendGranularity?: FinanceTrendGranularity;
  customStart?: string;
  customEnd?: string;
  search?: string;
  platforms?: FinancePlatform[];
  categories?: FinanceCategory[];
  inclusion?: "all" | "included" | "excluded";
  impact?: "all" | "positive" | "negative" | "zero";
  statuses?: string[];
  types?: string[];
  paymentMethods?: string[];
  minAmountCents?: number;
  maxAmountCents?: number;
  sort?: "time_desc" | "time_asc" | "amount_desc" | "amount_asc";
  cursor?: number;
  limit?: number;
}

export interface FinanceTrendPoint {
  key: string;
  label: string;
  impactCents: number;
}

export interface FinanceListResult {
  records: FinanceTransactionRecord[];
  nextCursor: number | null;
  totalCount: number;
  range: { start: string | null; end: string | null };
  rangeError: string | null;
  viewCounts: Record<FinanceView, number>;
  metrics: {
    netCents: number;
    includedCount: number;
    consumptionDays: number;
    dailyAverageCents: number;
    monthNetCents: number;
    todayNetCents: number;
  };
  overview: {
    trend: FinanceTrendPoint[];
    categories: Array<{ category: FinanceCategory; impactCents: number }>;
    platforms: Array<{ platform: FinancePlatform; impactCents: number }>;
  };
  facets: {
    statuses: string[];
    types: string[];
    paymentMethods: string[];
  };
}

export interface FinanceImportRow {
  sourceRow: number;
  fileHash: string;
  platform: FinancePlatform;
  sourceKey: string;
  transactionId: string | null;
  merchantOrderId: string | null;
  transactedAt: string;
  amountCents: number;
  rawFlow: string;
  rawStatus: string;
  rawType: string;
  counterparty: string;
  counterpartyAccount: string | null;
  description: string;
  paymentMethod: string;
  rawNote: string | null;
  rawPayloadJson: string;
  analysisKind: FinanceAnalysisKind;
  impactReason: FinanceImpactReason;
  category: FinanceCategory;
  isIncluded: boolean;
  action: "create" | "duplicate" | "error";
  reason: string | null;
}

export interface FinancePreviewFile {
  fileName: string;
  fileHash: string;
  platform: FinancePlatform;
  rangeStart: string | null;
  rangeEnd: string | null;
  sourceCount: number;
  newCount: number;
  duplicateCount: number;
  excludedCount: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  errorCount: number;
}

export interface FinanceImportPreview {
  token: string;
  files: FinancePreviewFile[];
  rows: FinanceImportRow[];
  counts: {
    source: number;
    create: number;
    duplicate: number;
    excluded: number;
    positive: number;
    negative: number;
    zero: number;
    error: number;
  };
  canCommit: boolean;
}

export interface FinanceImportResult {
  batchIds: string[];
  importedCount: number;
  duplicateCount: number;
  excludedCount: number;
}

export interface FinanceImportBatchRecord {
  id: string;
  fileName: string;
  fileHash: string;
  platform: FinancePlatform;
  rangeStart: string | null;
  rangeEnd: string | null;
  sourceCount: number;
  importedCount: number;
  duplicateCount: number;
  excludedCount: number;
  errorCount: number;
  createdAt: string;
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
  entityType: "task" | "memo" | "countdown" | "focus";
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
  toVersion: 12;
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

export type SyncStatus =
  | "unconfigured"
  | "signed_out"
  | "verification_required"
  | "password_recovery"
  | "binding"
  | "syncing"
  | "idle"
  | "offline"
  | "error";

export interface SyncState {
  status: SyncStatus;
  configured: boolean;
  canUseApp: boolean;
  email: string | null;
  boundEmail: string | null;
  lastSyncedAt: string | null;
  pendingCount: number;
  message: string | null;
}

export type DailyQuoteReaction = "none" | "favorite" | "disliked";
export type DailyQuoteSourceKind = "ai" | "corpus" | "manual" | "favorite";

export interface DailyQuoteRecord {
  id: string;
  text: string;
  localDate: string;
  reaction: DailyQuoteReaction;
  sourceKind: DailyQuoteSourceKind;
  sourceId: string | null;
  generationVersion: number;
  generatedAt: string;
  updatedAt: string;
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
    updateSeries(draft: TaskSeriesDraft): Promise<TaskSeriesResult>;
    setStatus(id: string, status: TaskRecord["status"]): Promise<void>;
    remove(id: string): Promise<void>;
    removeSeries(id: string): Promise<number>;
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
  quotes: {
    today(): Promise<DailyQuoteRecord | null>;
    dislike(id: string): Promise<DailyQuoteRecord>;
    setFavorite(input: {
      id: string;
      favorite: boolean;
    }): Promise<DailyQuoteRecord>;
    favorites(): Promise<DailyQuoteRecord[]>;
    addFavorite(input: { text: string }): Promise<DailyQuoteRecord>;
    removeFavorite(id: string): Promise<void>;
    useFavoriteToday(id: string): Promise<DailyQuoteRecord>;
    refresh(): Promise<DailyQuoteRecord>;
    retry(): Promise<DailyQuoteRecord>;
  };
  focus: {
    list(): Promise<FocusSessionRecord[]>;
    batches(): Promise<ImportBatchRecord[]>;
    preview(): Promise<TomatoPreview | null>;
    previewDropped(file: File): Promise<TomatoPreview>;
    confirm(token: string): Promise<ImportResult>;
    rollback(batchId: string): Promise<void>;
  };
  finance: {
    list(query: FinanceQuery): Promise<FinanceListResult>;
    preview(): Promise<FinanceImportPreview | null>;
    previewDropped(files: File[]): Promise<FinanceImportPreview>;
    confirm(token: string): Promise<FinanceImportResult>;
    update(input: {
      id: string;
      isIncluded?: boolean;
      category?: FinanceCategory;
      note?: string | null;
    }): Promise<void>;
    batches(): Promise<FinanceImportBatchRecord[]>;
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
  account: {
    signUp(input: { email: string; password: string }): Promise<void>;
    signIn(input: { email: string; password: string }): Promise<void>;
    resendVerification(email: string): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    completePasswordReset(password: string): Promise<void>;
    signOut(): Promise<void>;
  };
  sync: {
    getState(): Promise<SyncState>;
    run(): Promise<SyncState>;
    onState(listener: (state: SyncState) => void): () => void;
  };
}

declare global {
  interface Window {
    zhixu: ZhixuApi;
  }
}
