import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
} from "@fluentui/react-components";
import {
  ArrowUndo20Regular,
  ArrowUpload20Regular,
  Calendar20Regular,
  Clock20Regular,
  List20Regular,
} from "@fluentui/react-icons";
import type {
  TomatoImportRow,
  TomatoPreview,
  TomatoRowAction,
} from "../../../preload/api-types";
import {
  addLocalDays,
  localDateKey,
  localDayStart,
} from "../../../shared/local-date";
import { FocusAnalytics } from "../components/FocusAnalytics";
import { FocusHistory } from "../components/FocusHistory";
import { LocalDateField } from "../components/DateTimeFields";
import { EmptyState, Loading } from "../components/Page";
import { queryKeys } from "../query";
import {
  buildFocusWorkspace,
  FOCUS_VIEW_LABELS,
  formatFocusMinutes,
  type FocusFilters,
  type FocusView,
} from "./focus-workspace-model";

interface FocusPageProps {
  preview: TomatoPreview | null;
  onPreviewChange(preview: TomatoPreview | null): void;
}

type FocusTab = "overview" | "history" | "batches";

const focusViews: Array<{ value: FocusView; icon: React.ReactNode }> = [
  { value: "today", icon: <Calendar20Regular /> },
  { value: "week", icon: <Calendar20Regular /> },
  { value: "month", icon: <Calendar20Regular /> },
  { value: "all", icon: <List20Regular /> },
  { value: "custom", icon: <Calendar20Regular /> },
];

const actionLabels: Record<TomatoRowAction, string> = {
  create: "新增",
  update: "更新",
  unchanged: "重复",
  reconcile: "纠正",
  excluded: "排除",
  error: "错误",
};

function rowType(row: TomatoImportRow): string {
  if (row.classification === "focus") return "专注";
  if (row.classification === "life_event") return "生活事件";
  return "不导入";
}

function localDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function previewRangeLabel(preview: TomatoPreview): string {
  if (!preview.rangeStart && !preview.rangeEnd) return "未提供日期范围";
  const start = preview.rangeStart
    ? localDateLabel(localDateKey(new Date(preview.rangeStart)))
    : "未知";
  const end = preview.rangeEnd
    ? localDateLabel(localDateKey(new Date(preview.rangeEnd)))
    : "未知";
  return `${start}至${end}`;
}

function previewDateKey(row: TomatoImportRow): string {
  return row.startAt ? localDateKey(new Date(row.startAt)) : "无法识别日期";
}

function groupPreviewRows(
  rows: TomatoImportRow[],
): Array<[string, TomatoImportRow[]]> {
  const groups = new Map<string, TomatoImportRow[]>();
  for (const row of rows) {
    const key = previewDateKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].sort(([left], [right]) => right.localeCompare(left));
}

function initialFilters(now = new Date()): FocusFilters {
  return {
    view: "today",
    customStart: localDateKey(addLocalDays(localDayStart(now), -29)),
    customEnd: localDateKey(now),
  };
}

export function FocusPage({
  preview,
  onPreviewChange,
}: FocusPageProps): React.JSX.Element {
  const client = useQueryClient();
  const sessions = useQuery({
    queryKey: queryKeys.focus,
    queryFn: window.zhixu.focus.list,
  });
  const batches = useQuery({
    queryKey: queryKeys.batches,
    queryFn: window.zhixu.focus.batches,
  });
  const [filters, setFilters] = useState<FocusFilters>(initialFilters);
  const [tab, setTab] = useState<FocusTab>("overview");
  const [message, setMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const workspace = useMemo(
    () => buildFocusWorkspace(sessions.data ?? [], filters),
    [sessions.data, filters],
  );
  const previewGroups = preview ? groupPreviewRows(preview.rows) : [];
  const declaredMismatch =
    preview?.declaredMinutes != null &&
    preview.declaredMinutes !== preview.calculatedMinutes;

  const previewImport = useMutation({
    mutationFn: window.zhixu.focus.preview,
    onSuccess: (value) => {
      setImportError(null);
      if (value) onPreviewChange(value);
    },
    onError: (error) => setImportError(String(error)),
  });
  const confirmImport = useMutation({
    mutationFn: (token: string) => window.zhixu.focus.confirm(token),
    onSuccess: async (result) => {
      const committedPreview = preview;
      onPreviewChange(null);
      setImportError(null);
      const latestChangedRow = committedPreview?.rows
        .filter(
          (row) =>
            row.startAt &&
            row.classification !== "excluded" &&
            row.classification !== "error" &&
            ["create", "update", "reconcile"].includes(row.action),
        )
        .sort(
          (left, right) =>
            Date.parse(right.startAt ?? "") - Date.parse(left.startAt ?? ""),
        )[0];
      const latestDate = latestChangedRow?.startAt
        ? localDateKey(new Date(latestChangedRow.startAt))
        : null;
      const latestDayRows = latestDate
        ? (committedPreview?.rows ?? []).filter(
            (row) =>
              row.startAt &&
              localDateKey(new Date(row.startAt)) === latestDate &&
              row.action === "create",
          )
        : [];
      const latestDayNote = latestDate
        ? `；${localDateLabel(latestDate)}新增 ${latestDayRows.length} 条记录`
        : "";
      setMessage(
        `导入完成：新增 ${result.importedCount} 条，更新 ${result.updatedCount} 条，纠正旧错误 ${result.reconciledCount} 条，重复 ${result.skippedCount} 条，本次不导入 ${result.excludedCount} 条${latestDayNote}`,
      );
      await client.invalidateQueries();
      if (latestDate) {
        setFilters({
          view: "custom",
          customStart: latestDate,
          customEnd: latestDate,
        });
        setTab("history");
      }
      requestAnimationFrame(() =>
        workspaceRef.current?.scrollIntoView({ block: "start" }),
      );
    },
    onError: (error) => setImportError(String(error)),
  });
  const rollback = useMutation({
    mutationFn: window.zhixu.focus.rollback,
    onSuccess: () => client.invalidateQueries(),
  });

  if (sessions.isLoading) return <Loading />;
  const today = localDateKey(new Date());

  return (
    <div className="page focus-page">
      <header className="focus-workspace-header">
        <h1>专注</h1>
        <Button
          appearance="primary"
          icon={<ArrowUpload20Regular />}
          onClick={() => previewImport.mutate()}
          disabled={previewImport.isPending}
        >
          导入记录
        </Button>
      </header>

      <div className="focus-metrics-grid" aria-label="专注指标">
        <section className="focus-metric-card">
          <List20Regular />
          <div>
            <span>累计次数</span>
            <strong>{workspace.metrics.totalCount}</strong>
          </div>
        </section>
        <section className="focus-metric-card duration">
          <Clock20Regular />
          <div>
            <span>累计时长</span>
            <strong>
              {formatFocusMinutes(workspace.metrics.totalMinutes)}
            </strong>
          </div>
        </section>
        <section className="focus-metric-card days">
          <Calendar20Regular />
          <div>
            <span>专注天数</span>
            <strong>{workspace.metrics.focusDays}</strong>
          </div>
        </section>
        <section className="focus-metric-card average">
          <Clock20Regular />
          <div>
            <span>日均时长</span>
            <strong>
              {formatFocusMinutes(workspace.metrics.dailyAverageMinutes)}
            </strong>
          </div>
        </section>
        <section className="focus-metric-card today-count">
          <Calendar20Regular />
          <div>
            <span>今日次数</span>
            <strong>{workspace.metrics.todayCount}</strong>
          </div>
        </section>
        <section className="focus-metric-card today-duration">
          <Clock20Regular />
          <div>
            <span>今日时长</span>
            <strong>
              {formatFocusMinutes(workspace.metrics.todayMinutes)}
            </strong>
          </div>
        </section>
      </div>

      {message ? <div className="success-message">{message}</div> : null}
      {importError && !preview ? (
        <div className="error-message">{importError}</div>
      ) : null}

      <div className="focus-workspace-layout">
        <aside className="focus-filter-rail" aria-label="专注视图与概览">
          <section>
            <h2>快捷视图</h2>
            <nav aria-label="专注快捷视图">
              {focusViews.map((view) => (
                <button
                  type="button"
                  className={filters.view === view.value ? "active" : ""}
                  key={view.value}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      view: view.value,
                    }))
                  }
                >
                  {view.icon}
                  <span>{FOCUS_VIEW_LABELS[view.value]}</span>
                  <strong>{workspace.viewCounts[view.value]}</strong>
                </button>
              ))}
            </nav>
          </section>
          {filters.view === "custom" ? (
            <section className="focus-custom-range">
              <h2>日期范围</h2>
              <Field label="开始日期">
                <LocalDateField
                  value={filters.customStart}
                  max={today}
                  ariaLabel="专注开始日期"
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      customStart: value,
                    }))
                  }
                />
              </Field>
              <Field label="结束日期">
                <LocalDateField
                  value={filters.customEnd}
                  max={today}
                  ariaLabel="专注结束日期"
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      customEnd: value,
                    }))
                  }
                />
              </Field>
              {workspace.rangeError ? (
                <p className="focus-range-error">{workspace.rangeError}</p>
              ) : null}
            </section>
          ) : null}
          <section className="focus-overview">
            <h2>当前概览</h2>
            <dl>
              <div>
                <dt>次数</dt>
                <dd>{workspace.overview.count}</dd>
              </div>
              <div>
                <dt>时长</dt>
                <dd>{formatFocusMinutes(workspace.overview.minutes)}</dd>
              </div>
              <div>
                <dt>天数</dt>
                <dd>{workspace.overview.focusDays}</dd>
              </div>
              <div>
                <dt>平均单次</dt>
                <dd>
                  {formatFocusMinutes(workspace.overview.averageSessionMinutes)}
                </dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="focus-workspace-panel" ref={workspaceRef}>
          <div className="focus-workspace-toolbar">
            <div>
              <h2>{FOCUS_VIEW_LABELS[filters.view]}专注</h2>
              <span>{workspace.filteredSessions.length}</span>
            </div>
            <div
              className="focus-workspace-tabs"
              role="tablist"
              aria-label="专注视图"
            >
              {(
                [
                  ["overview", "数据概览"],
                  ["history", "专注明细"],
                  ["batches", "导入批次"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  className={tab === value ? "active" : ""}
                  key={value}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="focus-workspace-content">
            {tab === "overview" ? <FocusAnalytics model={workspace} /> : null}
            {tab === "history" ? (
              <FocusHistory sessions={workspace.filteredSessions} />
            ) : null}
            {tab === "batches" ? (
              (batches.data ?? []).length === 0 ? (
                <EmptyState
                  title="暂无导入批次"
                  detail="导入番茄 TODO 历史后可在此撤销对应批次。"
                />
              ) : (
                <div className="focus-batch-list">
                  {(batches.data ?? []).map((batch) => (
                    <div key={batch.id}>
                      <div>
                        <strong>{batch.fileName}</strong>
                        <small>
                          {new Date(batch.createdAt).toLocaleString("zh-CN")} ·
                          导入 {batch.importedCount} · 跳过 {batch.skippedCount}
                        </small>
                      </div>
                      {batch.rolledBackAt ? (
                        <span className="muted">已撤销</span>
                      ) : (
                        <Button
                          appearance="subtle"
                          icon={<ArrowUndo20Regular />}
                          onClick={() => {
                            if (confirm(`撤销 ${batch.fileName} 的数据变更？`))
                              rollback.mutate(batch.id);
                          }}
                        >
                          撤销
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </div>
        </section>
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={(_, data) => {
          if (!data.open) onPreviewChange(null);
        }}
      >
        <DialogSurface className="import-preview-dialog">
          <DialogBody>
            <DialogTitle>导入番茄记录</DialogTitle>
            <DialogContent>
              {preview ? (
                <div className="import-preview">
                  <div className="import-preview-file">
                    <strong>{preview.fileName}</strong>
                    <span>
                      {preview.exportUser ?? "未知用户"} · 导入范围{" "}
                      {previewRangeLabel(preview)} · 源文件{" "}
                      {preview.rows.length} 条记录
                    </span>
                  </div>
                  <div className="import-preview-metrics">
                    <div>
                      <span>专注</span>
                      <strong>{preview.focusCount} 条</strong>
                    </div>
                    <div>
                      <span>生活事件</span>
                      <strong>{preview.lifeEventCount} 条</strong>
                    </div>
                    <div>
                      <span>有效时长</span>
                      <strong>{preview.calculatedMinutes} 分钟</strong>
                    </div>
                    <div>
                      <span>本次不导入</span>
                      <strong>{preview.counts.excluded} 条</strong>
                    </div>
                  </div>
                  <div className="import-preview-outcomes">
                    <span>新增 {preview.counts.create}</span>
                    <span>更新 {preview.counts.update}</span>
                    <span>纠正旧错误 {preview.counts.reconcile}</span>
                    <span>重复 {preview.counts.unchanged}</span>
                    <span className={preview.counts.error ? "danger" : ""}>
                      错误 {preview.counts.error}
                    </span>
                  </div>
                  {declaredMismatch ? (
                    <div className="warning-message">
                      文件声明 {preview.declaredMinutes} 分钟，按有效记录计算为{" "}
                      {preview.calculatedMinutes} 分钟。
                    </div>
                  ) : null}
                  {importError ? (
                    <div className="error-message">{importError}</div>
                  ) : null}
                  <div className="import-preview-records">
                    {previewGroups.map(([date, rows]) => (
                      <section className="import-preview-day" key={date}>
                        <header>
                          <strong>
                            {date === "无法识别日期"
                              ? date
                              : localDateLabel(date)}
                          </strong>
                          <span>{rows.length} 条</span>
                        </header>
                        {rows.map((row) => {
                          const detail =
                            [row.reason, ...row.warnings]
                              .filter(Boolean)
                              .join("；") || null;
                          return (
                            <div
                              className="import-preview-row"
                              key={row.sourceRow}
                              data-action={row.action}
                            >
                              <time>
                                {row.startAt
                                  ? new Date(row.startAt).toLocaleTimeString(
                                      "zh-CN",
                                      {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    )
                                  : `第 ${row.sourceRow} 行`}
                              </time>
                              <strong>{row.taskName || "未识别事项"}</strong>
                              <span>
                                {row.durationMinutes == null
                                  ? "—"
                                  : `${row.durationMinutes} 分钟`}
                              </span>
                              <span className="import-row-result">
                                {rowType(row)} · {actionLabels[row.action]}
                              </span>
                              {detail ? <p>{detail}</p> : null}
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => onPreviewChange(null)}>取消</Button>
              <Button
                appearance="primary"
                disabled={!preview?.canCommit || confirmImport.isPending}
                onClick={() => preview && confirmImport.mutate(preview.token)}
              >
                {confirmImport.isPending ? "正在导入" : "确认导入"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
