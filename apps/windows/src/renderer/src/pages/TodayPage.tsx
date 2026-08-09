import type { CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@fluentui/react-components";
import {
  Add20Regular,
  ChevronRight20Regular,
  Note24Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import type { TaskRecord } from "../../../preload/api-types";
import { EmptyState, Loading } from "../components/Page";
import { TaskList } from "../components/TaskList";
import { queryKeys } from "../query";
import { buildTodayDashboard } from "./today-page-model";

function formatToday(date: Date): string {
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
  }).format(date);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekday}`;
}

function formatMinutes(value: number): string {
  if (value < 60) return `${value} 分钟`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
}

function formatDeadline(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysUntil(value: string, now: Date): number {
  const currentDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const due = new Date(value);
  const dueDay = new Date(
    due.getFullYear(),
    due.getMonth(),
    due.getDate(),
  ).getTime();
  return Math.max(0, Math.round((dueDay - currentDay) / 86_400_000));
}

function formatNoteTime(value: string, now: Date): string {
  const date = new Date(value);
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

function notePreview(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function TodayPage(props: {
  onNew(): void;
  onEdit(task: TaskRecord): void;
  onSearch(): void;
  onOpenNotes(noteId: string | null): void;
}): React.JSX.Element {
  const client = useQueryClient();
  const tasks = useQuery({
    queryKey: queryKeys.tasks,
    queryFn: window.zhixu.tasks.list,
  });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: window.zhixu.tasks.categories,
  });
  const tags = useQuery({
    queryKey: queryKeys.tags,
    queryFn: window.zhixu.tasks.tags,
  });
  const notes = useQuery({
    queryKey: queryKeys.notes,
    queryFn: window.zhixu.notes.list,
  });
  const summary = useQuery({
    queryKey: queryKeys.summary,
    queryFn: window.zhixu.dashboard.summary,
  });
  const status = useMutation({
    mutationFn: ({ id, value }: { id: string; value: TaskRecord["status"] }) =>
      window.zhixu.tasks.setStatus(id, value),
    onSuccess: () => client.invalidateQueries(),
  });
  const remove = useMutation({
    mutationFn: window.zhixu.tasks.remove,
    onSuccess: () => client.invalidateQueries(),
  });
  if (tasks.isLoading || summary.isLoading || notes.isLoading)
    return <Loading />;

  const now = new Date();
  const dashboard = buildTodayDashboard(tasks.data ?? [], now);
  const upcoming = dashboard.upcomingTasks.slice(0, 4);
  const recentNotes = [...(notes.data ?? [])]
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )
    .slice(0, 4);
  const focusByDay = summary.data?.focusByDay ?? [];
  const maxFocusMinutes = Math.max(
    1,
    ...focusByDay.map((item) => item.minutes),
  );
  const remainingCount = dashboard.totalCount - dashboard.completedCount;
  const estimatedMinutes = dashboard.todayTasks
    .filter((task) => task.status !== "done")
    .reduce((total, task) => total + task.estimatedMinutes, 0);

  return (
    <div className="page today-page">
      <header className="today-header">
        <div>
          <h1>
            今天 <span>/ {formatToday(now)}</span>
          </h1>
          <p>聚焦今天最重要的事，稳步推进当前计划。</p>
        </div>
        <div className="today-header-actions">
          <Button
            className="today-search"
            appearance="outline"
            icon={<Search20Regular />}
            onClick={props.onSearch}
          >
            搜索任务、笔记…
          </Button>
          <Button
            appearance="primary"
            icon={<Add20Regular />}
            onClick={props.onNew}
          >
            添加任务
          </Button>
        </div>
      </header>

      <div className="today-dashboard-grid">
        <section className="today-panel today-task-panel">
          <div className="today-panel-heading">
            <h2>今日待办</h2>
            <span className="panel-count">{dashboard.totalCount}</span>
            {estimatedMinutes > 0 ? (
              <span className="panel-meta">
                预计 {formatMinutes(estimatedMinutes)}
              </span>
            ) : null}
          </div>
          {dashboard.todayTasks.length ? (
            <TaskList
              tasks={dashboard.todayTasks}
              categories={categories.data ?? []}
              tags={tags.data ?? []}
              onEdit={props.onEdit}
              onStatus={(task, value) => status.mutate({ id: task.id, value })}
              onDelete={(task) => {
                if (confirm(`删除“${task.title}”？`)) remove.mutate(task.id);
              }}
            />
          ) : (
            <EmptyState
              title="今天没有待处理任务"
              detail="添加任务后，今日安排会集中显示在这里。"
              action={<Button onClick={props.onNew}>添加任务</Button>}
            />
          )}
          <button
            className="panel-footer-action"
            type="button"
            onClick={props.onNew}
          >
            <Add20Regular />
            添加任务
          </button>
        </section>

        <section className="today-panel upcoming-panel">
          <div className="today-panel-heading">
            <h2>即将到期</h2>
            <span className="panel-count">
              {dashboard.upcomingTasks.length}
            </span>
          </div>
          {upcoming.length ? (
            <div className="upcoming-list">
              {upcoming.map((task) => {
                const remainingDays = daysUntil(task.dueAt!, now);
                return (
                  <button
                    type="button"
                    key={task.id}
                    className={`upcoming-item ${remainingDays <= 1 ? "urgent" : remainingDays <= 3 ? "soon" : "later"}`}
                    onClick={() => props.onEdit(task)}
                  >
                    <span className="deadline-dot" />
                    <span className="upcoming-main">
                      <strong>{task.title}</strong>
                      <small>
                        {remainingDays === 1
                          ? "明天到期"
                          : `剩余 ${remainingDays} 天`}
                      </small>
                    </span>
                    <time>{formatDeadline(task.dueAt!)}</time>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="暂无临近截止任务"
              detail="未来任务会按截止时间显示。"
            />
          )}
        </section>

        <section className="today-panel today-progress-panel">
          <div className="today-panel-heading">
            <h2>今日进度概览</h2>
          </div>
          <div className="today-progress-grid">
            <div className="completion-metric">
              <span>今日完成率</span>
              <div
                className="completion-ring"
                role="progressbar"
                aria-label="今日完成率"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={dashboard.completionRate}
                style={
                  {
                    "--completion-angle": `${dashboard.completionRate * 3.6}deg`,
                  } as CSSProperties
                }
              >
                <strong>{dashboard.completionRate}%</strong>
              </div>
              <small>
                {dashboard.completedCount} / {dashboard.totalCount} 已完成
              </small>
            </div>

            <div className="focus-metric">
              <span>今日专注</span>
              <strong>
                {formatMinutes(summary.data?.focusTodayMinutes ?? 0)}
              </strong>
              <small>近七日专注趋势</small>
              <div className="focus-bars" aria-label="近七日专注趋势">
                {focusByDay.map((item) => (
                  <i
                    key={item.date}
                    title={`${item.date} ${item.minutes} 分钟`}
                    style={{
                      height: `${Math.max(8, (item.minutes / maxFocusMinutes) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="task-progress-metric">
              <span>任务完成数</span>
              <strong>
                {dashboard.completedCount}
                <small> / {dashboard.totalCount}</small>
              </strong>
              <div className="completion-dots" aria-hidden="true">
                {dashboard.todayTasks.slice(0, 8).map((task) => (
                  <i
                    key={task.id}
                    className={task.status === "done" ? "done" : ""}
                  />
                ))}
              </div>
              <small>
                {remainingCount
                  ? `还有 ${remainingCount} 项待处理`
                  : "今日任务已处理完毕"}
              </small>
            </div>
          </div>
        </section>

        <section className="today-panel suggestion-panel">
          <div className="suggestion-heading">
            <span className="suggestion-icon">◎</span>
            <h2>今日重点建议</h2>
          </div>
          {dashboard.focusTask ? (
            <>
              <p>
                优先处理“{dashboard.focusTask.title}”
                {dashboard.focusTask.priority === 3
                  ? "，该任务优先级较高。"
                  : "，完成后再推进后续安排。"}
              </p>
              <Button
                appearance="outline"
                icon={<ChevronRight20Regular />}
                onClick={() => props.onEdit(dashboard.focusTask!)}
              >
                查看任务
              </Button>
            </>
          ) : (
            <>
              <p>今日任务已经处理完毕，可补充新的安排或整理最近笔记。</p>
              <Button
                appearance="outline"
                icon={<Add20Regular />}
                onClick={props.onNew}
              >
                添加任务
              </Button>
            </>
          )}
        </section>

        <section className="today-panel recent-notes-panel">
          <div className="today-panel-heading">
            <h2>最近笔记</h2>
            <button
              type="button"
              className="panel-link"
              onClick={() => props.onOpenNotes(null)}
            >
              查看全部
              <ChevronRight20Regular />
            </button>
          </div>
          {recentNotes.length ? (
            <div className="recent-notes-grid">
              {recentNotes.map((note) => (
                <button
                  type="button"
                  className="recent-note-card"
                  key={note.id}
                  onClick={() => props.onOpenNotes(note.id)}
                >
                  <span className="note-card-icon">
                    <Note24Regular />
                  </span>
                  <span className="note-card-main">
                    <strong>{note.title}</strong>
                    <small>{formatNoteTime(note.updatedAt, now)}</small>
                    <span>{notePreview(note.contentMd) || "暂无正文内容"}</span>
                  </span>
                  {note.isPinned ? <em>置顶</em> : null}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="暂无笔记"
              detail="最近编辑的笔记会显示在这里。"
            />
          )}
        </section>
      </div>
    </div>
  );
}
