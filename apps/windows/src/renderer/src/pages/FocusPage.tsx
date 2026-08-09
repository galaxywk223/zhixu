import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import {
  ArrowUpload20Regular,
  ArrowUndo20Regular,
} from "@fluentui/react-icons";
import type {
  TomatoImportRow,
  TomatoPreview,
  TomatoRowAction,
} from "../../../preload/api-types";
import { EmptyState, Loading, PageHeader, StatCard } from "../components/Page";
import { queryKeys } from "../query";

interface FocusPageProps {
  preview: TomatoPreview | null;
  onPreviewChange(preview: TomatoPreview | null): void;
}

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
  const summary = useQuery({
    queryKey: queryKeys.summary,
    queryFn: window.zhixu.dashboard.summary,
  });
  const [range, setRange] = useState<"today" | "7" | "30" | "all">("30");
  const [message, setMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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
      onPreviewChange(null);
      setImportError(null);
      setMessage(
        `新增 ${result.importedCount} 条，更新 ${result.updatedCount} 条，纠正 ${result.reconciledCount} 条，重复 ${result.skippedCount} 条，排除 ${result.excludedCount} 条`,
      );
      await client.invalidateQueries();
    },
    onError: (error) => setImportError(String(error)),
  });
  const rollback = useMutation({
    mutationFn: window.zhixu.focus.rollback,
    onSuccess: () => client.invalidateQueries(),
  });
  if (sessions.isLoading) return <Loading />;
  const cutoff =
    range === "all"
      ? 0
      : Date.now() - (range === "today" ? 1 : Number(range)) * 86_400_000;
  const filtered = (sessions.data ?? []).filter(
    (item) => Date.parse(item.startAt) >= cutoff,
  );
  const declaredMismatch =
    preview?.declaredMinutes != null &&
    preview.declaredMinutes !== preview.calculatedMinutes;
  return (
    <div className="page">
      <PageHeader
        title="专注"
        actions={
          <Button
            appearance="primary"
            icon={<ArrowUpload20Regular />}
            onClick={() => previewImport.mutate()}
            disabled={previewImport.isPending}
          >
            导入 .xls
          </Button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="今日专注"
          value={`${summary.data?.focusTodayMinutes ?? 0} 分钟`}
          tone="green"
        />
        <StatCard
          label="近 7 天"
          value={`${summary.data?.focusWeekMinutes ?? 0} 分钟`}
        />
        <StatCard
          label="本月"
          value={`${summary.data?.focusMonthMinutes ?? 0} 分钟`}
          tone="blue"
        />
        <StatCard label="当前记录" value={sessions.data?.length ?? 0} />
      </div>
      {message ? <div className="success-message">{message}</div> : null}
      {importError && !preview ? (
        <div className="error-message">{importError}</div>
      ) : null}
      <div className="filter-bar">
        <div className="segmented">
          {(
            [
              ["today", "今天"],
              ["7", "近 7 天"],
              ["30", "近 30 天"],
              ["all", "全部"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={range === value ? "active" : ""}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section className="workspace-section">
        <div className="section-heading">
          <h2>专注明细</h2>
          <span>{filtered.length} 条</span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title="暂无专注记录"
            detail="从设置或当前页面导入番茄 TODO 的 .xls 导出文件。"
          />
        ) : (
          <div className="data-table">
            <div className="data-head">
              <span>时间</span>
              <span>专注事项</span>
              <span>时长</span>
              <span>状态</span>
              <span>心得</span>
            </div>
            {filtered.map((item) => (
              <div className="data-row" key={item.id}>
                <time>{new Date(item.startAt).toLocaleString("zh-CN")}</time>
                <strong>{item.taskName}</strong>
                <span>{item.durationMinutes} 分钟</span>
                <span>{item.status || "未知"}</span>
                <span>{item.reflection || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="workspace-section">
        <div className="section-heading">
          <h2>导入批次</h2>
          <span>{batches.data?.length ?? 0}</span>
        </div>
        <div className="batch-list">
          {(batches.data ?? []).map((batch) => (
            <div key={batch.id}>
              <div>
                <strong>{batch.fileName}</strong>
                <small>
                  {new Date(batch.createdAt).toLocaleString("zh-CN")} · 导入{" "}
                  {batch.importedCount} · 跳过 {batch.skippedCount}
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
      </section>
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
                      {preview.exportUser ?? "未知用户"} · {preview.rows.length}{" "}
                      条
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
                      <span>数据变更</span>
                      <strong>
                        {preview.counts.create +
                          preview.counts.update +
                          preview.counts.reconcile}{" "}
                        条
                      </strong>
                    </div>
                  </div>
                  <div className="import-preview-outcomes">
                    <span>新增 {preview.counts.create}</span>
                    <span>更新 {preview.counts.update}</span>
                    <span>纠正 {preview.counts.reconcile}</span>
                    <span>重复 {preview.counts.unchanged}</span>
                    <span>排除 {preview.counts.excluded}</span>
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
                  <div className="import-preview-table-wrap">
                    <table className="import-preview-table">
                      <thead>
                        <tr>
                          <th>行</th>
                          <th>时间</th>
                          <th>事项</th>
                          <th>类型</th>
                          <th>时长</th>
                          <th>处理</th>
                          <th>说明</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.sourceRow} data-action={row.action}>
                            <td>{row.sourceRow}</td>
                            <td>
                              {row.startAt
                                ? new Date(row.startAt).toLocaleString(
                                    "zh-CN",
                                    {
                                      month: "2-digit",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : "—"}
                            </td>
                            <td>{row.taskName || "—"}</td>
                            <td>{rowType(row)}</td>
                            <td>
                              {row.durationMinutes == null
                                ? "—"
                                : `${row.durationMinutes} 分钟`}
                            </td>
                            <td>
                              <span className="import-action">
                                {actionLabels[row.action]}
                              </span>
                            </td>
                            <td>
                              {row.reason || row.warnings.join("；") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
