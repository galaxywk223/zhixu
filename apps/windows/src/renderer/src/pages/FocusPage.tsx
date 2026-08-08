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
import type { TomatoPreview } from "../../../preload/api-types";
import { EmptyState, Loading, PageHeader, StatCard } from "../components/Page";
import { queryKeys } from "../query";

export function FocusPage(): React.JSX.Element {
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
  const [preview, setPreview] = useState<TomatoPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const previewImport = useMutation({
    mutationFn: window.zhixu.focus.preview,
    onSuccess: setPreview,
  });
  const confirmImport = useMutation({
    mutationFn: (token: string) => window.zhixu.focus.confirm(token),
    onSuccess: async (result) => {
      setPreview(null);
      setMessage(
        `新增 ${result.importedCount} 条，更新 ${result.updatedCount} 条，跳过 ${result.skippedCount} 条`,
      );
      await client.invalidateQueries();
    },
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
  return (
    <div className="page">
      <PageHeader
        title="专注"
        subtitle="专注记录来自番茄 TODO 导入，不会创建或修改待办。"
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
          if (!data.open) setPreview(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>确认导入番茄记录</DialogTitle>
            <DialogContent>
              {preview ? (
                <div className="preview-summary">
                  <p>
                    <strong>{preview.fileName}</strong>
                  </p>
                  <p>导出用户：{preview.exportUser ?? "未知"}</p>
                  <p>
                    记录：{preview.sessions.length} 条，其中正时长{" "}
                    {
                      preview.sessions.filter(
                        (item) => item.durationMinutes > 0,
                      ).length
                    }{" "}
                    条
                  </p>
                  <p>声明专注：{preview.declaredMinutes ?? 0} 分钟</p>
                  <p className="muted">
                    重复记录按时间键跳过，零分钟记录只作为生活事件导入。
                  </p>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPreview(null)}>取消</Button>
              <Button
                appearance="primary"
                onClick={() => preview && confirmImport.mutate(preview.token)}
              >
                确认导入
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
