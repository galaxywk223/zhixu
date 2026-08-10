import type { FocusFilters, FocusView } from "./pages/focus-workspace-model";
import type { MemoView } from "./pages/memo-workspace-model";
import type { SleepFilters, SleepView } from "./pages/sleep-workspace-model";
import type { TaskView } from "./pages/task-workspace-model";
import type { FinanceFilters } from "./pages/finance-workspace-model";
import type { FinanceView } from "../../preload/api-types";
import { parseLocalDateKey } from "../../shared/local-date";

export const WORKSPACE_VIEW_PREFERENCES_KEY = "zhixu-workspace-views-v1";

interface WorkspaceViewPreferences {
  taskView?: TaskView;
  memoView?: MemoView;
  focus?: FocusFilters;
  sleep?: SleepFilters;
  finance?: FinanceFilters;
}

const taskViews: TaskView[] = [
  "active",
  "all",
  "overdue",
  "today",
  "tomorrow",
  "next7days",
  "done",
];
const memoViews: MemoView[] = ["all", "high", "medium", "low"];
const focusViews: FocusView[] = ["today", "week", "month", "all", "custom"];
const sleepViews: SleepView[] = ["last7", "last30", "all", "custom"];
const financeViews: FinanceView[] = [
  "today",
  "week",
  "month",
  "year",
  "all",
  "custom",
];

function readPreferences(): WorkspaceViewPreferences {
  try {
    const raw = localStorage.getItem(WORKSPACE_VIEW_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as WorkspaceViewPreferences)
      : {};
  } catch {
    return {};
  }
}

function updatePreferences(patch: Partial<WorkspaceViewPreferences>): void {
  try {
    localStorage.setItem(
      WORKSPACE_VIEW_PREFERENCES_KEY,
      JSON.stringify({ ...readPreferences(), ...patch }),
    );
  } catch {
    // View selection still works for the current mount when storage is unavailable.
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    parseLocalDateKey(value);
    return true;
  } catch {
    return false;
  }
}

function validRange<T extends FocusFilters | SleepFilters | FinanceFilters>(
  value: unknown,
  views: ReadonlyArray<T["view"]>,
  fallback: T,
): T {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<T>;
  if (!views.includes(candidate.view as T["view"])) return fallback;
  const customStart = validDate(candidate.customStart)
    ? candidate.customStart
    : fallback.customStart;
  const customEnd = validDate(candidate.customEnd)
    ? candidate.customEnd
    : fallback.customEnd;
  if (
    candidate.view === "custom" &&
    (!validDate(candidate.customStart) ||
      !validDate(candidate.customEnd) ||
      candidate.customStart > candidate.customEnd)
  )
    return fallback;
  return { ...fallback, view: candidate.view, customStart, customEnd } as T;
}

export function loadTaskView(fallback: TaskView): TaskView {
  const value = readPreferences().taskView;
  return taskViews.includes(value as TaskView) ? (value as TaskView) : fallback;
}

export function saveTaskView(value: TaskView): void {
  updatePreferences({ taskView: value });
}

export function loadMemoView(fallback: MemoView): MemoView {
  const value = readPreferences().memoView;
  return memoViews.includes(value as MemoView) ? (value as MemoView) : fallback;
}

export function saveMemoView(value: MemoView): void {
  updatePreferences({ memoView: value });
}

export function loadFocusFilters(fallback: FocusFilters): FocusFilters {
  return validRange(readPreferences().focus, focusViews, fallback);
}

export function saveFocusFilters(value: FocusFilters): void {
  updatePreferences({ focus: value });
}

export function loadSleepFilters(fallback: SleepFilters): SleepFilters {
  return validRange(readPreferences().sleep, sleepViews, fallback);
}

export function saveSleepFilters(value: SleepFilters): void {
  updatePreferences({ sleep: value });
}

export function loadFinanceFilters(fallback: FinanceFilters): FinanceFilters {
  return validRange(readPreferences().finance, financeViews, fallback);
}

export function saveFinanceFilters(value: FinanceFilters): void {
  updatePreferences({ finance: value });
}
