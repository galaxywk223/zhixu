import type { LifeEventRecord, TaskRecord } from "../preload/api-types";

export type TaskGroupKind =
  "overdue" | "today" | "tomorrow" | "next7days" | "later" | "undated" | "done";

export interface TaskGroup {
  kind: TaskGroupKind;
  label: string;
  tasks: TaskRecord[];
}

const groupLabels: Record<TaskGroupKind, string> = {
  overdue: "已逾期",
  today: "今天",
  tomorrow: "明天",
  next7days: "近 7 天",
  later: "以后",
  undated: "无日期",
  done: "已完成",
};

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function taskGroupKind(
  task: TaskRecord,
  now = new Date(),
): TaskGroupKind {
  if (task.status === "done") return "done";
  if (!task.dueAt) return "undated";
  const due = new Date(task.dueAt);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const dueKey = localDateKey(due);
  if (dueKey < localDateKey(today)) return "overdue";
  if (dueKey === localDateKey(today)) return "today";
  if (dueKey === localDateKey(tomorrow)) return "tomorrow";
  if (due < weekEnd) return "next7days";
  return "later";
}

export function groupTasks(tasks: TaskRecord[], now = new Date()): TaskGroup[] {
  const order: TaskGroupKind[] = [
    "overdue",
    "today",
    "tomorrow",
    "next7days",
    "later",
    "undated",
    "done",
  ];
  const groups = new Map<TaskGroupKind, TaskRecord[]>(
    order.map((kind) => [kind, []]),
  );
  for (const task of tasks) groups.get(taskGroupKind(task, now))?.push(task);
  return order.map((kind) => ({
    kind,
    label: groupLabels[kind],
    tasks: (groups.get(kind) ?? []).sort((left, right) => {
      if (left.dueAt && right.dueAt)
        return left.dueAt.localeCompare(right.dueAt);
      return right.updatedAt.localeCompare(left.updatedAt);
    }),
  }));
}

export interface SleepRecord {
  start: LifeEventRecord | null;
  end: LifeEventRecord | null;
  durationMinutes: number | null;
  issue: string | null;
}

export function buildSleepRecords(source: LifeEventRecord[]): SleepRecord[] {
  const events = source
    .filter((event) => event.kind === "sleep" || event.kind === "wake")
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const result: SleepRecord[] = [];
  let pending: LifeEventRecord | null = null;
  for (const event of events) {
    if (event.kind === "sleep") {
      if (pending)
        result.push({
          start: pending,
          end: null,
          durationMinutes: null,
          issue: "缺少起床记录",
        });
      pending = event;
      continue;
    }
    if (!pending) {
      result.push({
        start: null,
        end: event,
        durationMinutes: null,
        issue: "缺少睡觉记录",
      });
      continue;
    }
    const durationMinutes = Math.round(
      (Date.parse(event.occurredAt) - Date.parse(pending.occurredAt)) / 60_000,
    );
    result.push({
      start: pending,
      end: event,
      durationMinutes,
      issue:
        durationMinutes <= 0
          ? "时间顺序异常"
          : durationMinutes > 24 * 60
            ? "睡眠区间超过 24 小时"
            : null,
    });
    pending = null;
  }
  if (pending)
    result.push({
      start: pending,
      end: null,
      durationMinutes: null,
      issue: "缺少起床记录",
    });
  return result.reverse();
}

export function normalizeLegacyTomatoText(value: string): string {
  if (!value || /^[\x20-\x7E]*$/.test(value)) return value;
  const bytes = Uint8Array.from(
    [...value].map((character) => character.charCodeAt(0) & 0xff),
  );
  try {
    const decoded = new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
    const score = (text: string): number =>
      [...text].filter((character) => /[\u4e00-\u9fff]/.test(character)).length;
    return score(decoded) > score(value)
      ? decoded.replace(/\0/g, "").trim()
      : value;
  } catch {
    return value;
  }
}

export function classifyLifeEvent(value: string): "sleep" | "wake" | "other" {
  const normalized = normalizeLegacyTomatoText(value).toLowerCase();
  if (/(睡眠|睡觉|入睡|sleep)/.test(normalized)) return "sleep";
  if (/(起床|醒来|wake)/.test(normalized)) return "wake";
  return "other";
}
