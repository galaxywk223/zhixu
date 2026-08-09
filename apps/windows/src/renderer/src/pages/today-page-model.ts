import type { TaskRecord } from "../../../preload/api-types";

export interface TodayDashboardModel {
  todayTasks: TaskRecord[];
  upcomingTasks: TaskRecord[];
  completedCount: number;
  totalCount: number;
  completionRate: number;
  focusTask: TaskRecord | null;
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function comparePending(left: TaskRecord, right: TaskRecord): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  return (
    (timestamp(left.dueAt) ?? Number.POSITIVE_INFINITY) -
    (timestamp(right.dueAt) ?? Number.POSITIVE_INFINITY)
  );
}

export function buildTodayDashboard(
  tasks: TaskRecord[],
  now = new Date(),
): TodayDashboardModel {
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.getTime();

  const overdue = tasks
    .filter((task) => {
      const due = timestamp(task.dueAt);
      return task.status !== "done" && due !== null && due < start;
    })
    .sort(comparePending);
  const dueToday = tasks
    .filter((task) => {
      const due = timestamp(task.dueAt);
      return due !== null && due >= start && due < end;
    })
    .sort((left, right) => {
      if (left.status === "done" && right.status !== "done") return 1;
      if (left.status !== "done" && right.status === "done") return -1;
      return comparePending(left, right);
    });
  const completedToday = tasks
    .filter((task) => {
      const completed = timestamp(task.completedAt);
      return (
        task.status === "done" &&
        completed !== null &&
        completed >= start &&
        completed < end
      );
    })
    .sort(
      (left, right) =>
        (timestamp(right.completedAt) ?? 0) -
        (timestamp(left.completedAt) ?? 0),
    );

  const seen = new Set<string>();
  const todayTasks = [...overdue, ...dueToday, ...completedToday].filter(
    (task) => {
      if (seen.has(task.id)) return false;
      seen.add(task.id);
      return true;
    },
  );
  const upcomingTasks = tasks
    .filter((task) => {
      const due = timestamp(task.dueAt);
      return task.status !== "done" && due !== null && due >= end;
    })
    .sort((left, right) => {
      const dueDifference =
        (timestamp(left.dueAt) ?? Number.POSITIVE_INFINITY) -
        (timestamp(right.dueAt) ?? Number.POSITIVE_INFINITY);
      return dueDifference || comparePending(left, right);
    });
  const completedCount = todayTasks.filter(
    (task) => task.status === "done",
  ).length;
  const totalCount = todayTasks.length;

  return {
    todayTasks,
    upcomingTasks,
    completedCount,
    totalCount,
    completionRate:
      totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100),
    focusTask: todayTasks.find((task) => task.status !== "done") ?? null,
  };
}
