import type { TaskRecord } from "../../../preload/api-types";
import {
  groupTasks,
  taskGroupKind,
  type TaskGroup,
} from "../../../shared/domain";

export type TaskView =
  | "active"
  | "all"
  | "overdue"
  | "today"
  | "tomorrow"
  | "next7days"
  | "undated"
  | "done";

export type TaskSort = "due" | "priority" | "updated";
export type ExactTaskStatus = "all" | TaskRecord["status"];

export interface TaskWorkspaceFilters {
  view: TaskView;
  query: string;
  status: ExactTaskStatus;
  categoryId: string;
  tagId: string;
}

export interface TaskWorkspaceMetrics {
  total: number;
  dueToday: number;
  overdue: number;
  completed: number;
  inProgress: number;
  remainingEstimatedMinutes: number;
}

export interface TaskWorkspaceModel {
  filteredTasks: TaskRecord[];
  groups: TaskGroup[];
  viewCounts: Record<TaskView, number>;
  tagCounts: Record<string, number>;
  metrics: TaskWorkspaceMetrics;
}

export const TASK_VIEW_LABELS: Record<TaskView, string> = {
  active: "未完成",
  all: "全部任务",
  overdue: "已逾期",
  today: "今天",
  tomorrow: "明天",
  next7days: "近 7 天",
  undated: "无日期",
  done: "已完成",
};

export const DEFAULT_TASK_WORKSPACE_FILTERS: TaskWorkspaceFilters = {
  view: "active",
  query: "",
  status: "all",
  categoryId: "all",
  tagId: "all",
};

function timestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function updatedTimestamp(task: TaskRecord): number {
  const parsed = Date.parse(task.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDayBounds(now: Date): { start: number; end: number } {
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);
  return { start: startDate.getTime(), end: endDate.getTime() };
}

export function matchesTaskView(
  task: TaskRecord,
  view: TaskView,
  now = new Date(),
): boolean {
  if (view === "all") return true;
  if (view === "active") return task.status !== "done";
  if (view === "done") return task.status === "done";
  return taskGroupKind(task, now) === view;
}

function matchesBaseFilters(
  task: TaskRecord,
  filters: TaskWorkspaceFilters,
  now: Date,
): boolean {
  if (!matchesTaskView(task, filters.view, now)) return false;
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("zh-CN");
  if (
    normalizedQuery &&
    !`${task.title} ${task.descriptionMd ?? ""}`
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery)
  )
    return false;
  if (filters.status !== "all" && task.status !== filters.status) return false;
  if (filters.categoryId !== "all" && task.categoryId !== filters.categoryId)
    return false;
  return true;
}

export function sortWorkspaceTasks(
  tasks: TaskRecord[],
  sort: TaskSort,
): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    if (sort === "priority") {
      return (
        right.priority - left.priority ||
        timestamp(left.dueAt) - timestamp(right.dueAt) ||
        updatedTimestamp(right) - updatedTimestamp(left)
      );
    }
    if (sort === "updated") {
      return (
        updatedTimestamp(right) - updatedTimestamp(left) ||
        timestamp(left.dueAt) - timestamp(right.dueAt) ||
        right.priority - left.priority
      );
    }
    return (
      timestamp(left.dueAt) - timestamp(right.dueAt) ||
      right.priority - left.priority ||
      updatedTimestamp(right) - updatedTimestamp(left)
    );
  });
}

export function calculateTaskWorkspaceMetrics(
  tasks: TaskRecord[],
  now = new Date(),
): TaskWorkspaceMetrics {
  const { start, end } = localDayBounds(now);
  return {
    total: tasks.length,
    dueToday: tasks.filter((task) => {
      const due = timestamp(task.dueAt);
      return due >= start && due < end;
    }).length,
    overdue: tasks.filter(
      (task) => task.status !== "done" && timestamp(task.dueAt) < start,
    ).length,
    completed: tasks.filter((task) => task.status === "done").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    remainingEstimatedMinutes: tasks
      .filter((task) => task.status !== "done")
      .reduce((total, task) => total + Math.max(0, task.estimatedMinutes), 0),
  };
}

export function formatEstimatedMinutes(minutes: number): string {
  const normalized = Math.max(0, Math.round(minutes));
  if (normalized < 60) return `${normalized} 分钟`;
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return remainder === 0 ? `${hours} 小时` : `${hours} 小时 ${remainder} 分钟`;
}

export function selectTaskView(
  filters: TaskWorkspaceFilters,
  view: TaskView,
): TaskWorkspaceFilters {
  return { ...filters, view, status: "all" };
}

export function selectExactTaskStatus(
  filters: TaskWorkspaceFilters,
  status: ExactTaskStatus,
): TaskWorkspaceFilters {
  return { ...filters, view: "all", status };
}

export function buildTaskWorkspace(
  tasks: TaskRecord[],
  filters: TaskWorkspaceFilters,
  sort: TaskSort,
  now = new Date(),
): TaskWorkspaceModel {
  const baseTasks = tasks.filter((task) =>
    matchesBaseFilters(task, filters, now),
  );
  const tagCounts = baseTasks.reduce<Record<string, number>>((counts, task) => {
    for (const tagId of task.tagIds) counts[tagId] = (counts[tagId] ?? 0) + 1;
    return counts;
  }, {});
  const filteredTasks =
    filters.tagId === "all"
      ? baseTasks
      : baseTasks.filter((task) => task.tagIds.includes(filters.tagId));
  const groups = groupTasks(filteredTasks, now).map((group) => ({
    ...group,
    tasks: sortWorkspaceTasks(group.tasks, sort),
  }));
  const views = Object.keys(TASK_VIEW_LABELS) as TaskView[];
  const viewCounts = Object.fromEntries(
    views.map((view) => [
      view,
      tasks.filter((task) => matchesTaskView(task, view, now)).length,
    ]),
  ) as Record<TaskView, number>;

  return {
    filteredTasks,
    groups,
    viewCounts,
    tagCounts,
    metrics: calculateTaskWorkspaceMetrics(tasks, now),
  };
}
