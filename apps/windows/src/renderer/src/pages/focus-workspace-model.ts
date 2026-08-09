import type { FocusSessionRecord } from "../../../preload/api-types";
import {
  addLocalDays,
  localDateKey,
  localDayStart,
  parseLocalDateKey,
} from "../../../shared/local-date";

export type FocusView = "today" | "week" | "month" | "all" | "custom";

export interface FocusFilters {
  view: FocusView;
  customStart: string;
  customEnd: string;
}

export interface FocusSubjectSlice {
  name: string;
  minutes: number;
  percentage: number;
}

export interface FocusTrendPoint {
  key: string;
  label: string;
  minutes: number;
}

export interface FocusWorkspaceModel {
  filteredSessions: FocusSessionRecord[];
  rangeError: string | null;
  viewCounts: Record<FocusView, number>;
  metrics: {
    totalCount: number;
    totalMinutes: number;
    focusDays: number;
    dailyAverageMinutes: number;
    todayCount: number;
    todayMinutes: number;
  };
  overview: {
    count: number;
    minutes: number;
    focusDays: number;
    averageSessionMinutes: number;
  };
  subjects: FocusSubjectSlice[];
  hours: Array<{ hour: number; label: string; minutes: number }>;
  trend: FocusTrendPoint[];
  trendGranularity: "day" | "week";
}

export const DEFAULT_FOCUS_FILTERS: FocusFilters = {
  view: "today",
  customStart: "",
  customEnd: "",
};

export const FOCUS_VIEW_LABELS: Record<FocusView, string> = {
  today: "今天",
  week: "本周",
  month: "本月",
  all: "全部",
  custom: "自定义",
};

function validTimestamp(item: FocusSessionRecord): number | null {
  const value = Date.parse(item.startAt);
  return Number.isFinite(value) ? value : null;
}

function boundsForView(
  view: Exclude<FocusView, "all" | "custom">,
  now: Date,
): { start: number; end: number } {
  const today = localDayStart(now);
  if (view === "today") {
    return { start: today.getTime(), end: addLocalDays(today, 1).getTime() };
  }
  if (view === "week") {
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = addLocalDays(today, -mondayOffset);
    return { start: start.getTime(), end: addLocalDays(start, 7).getTime() };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { start: start.getTime(), end: end.getTime() };
}

function customBounds(filters: FocusFilters): {
  start: number;
  end: number;
  error: string | null;
} {
  if (!filters.customStart || !filters.customEnd) {
    return { start: 0, end: 0, error: "请选择完整的起止日期" };
  }
  try {
    const start = parseLocalDateKey(filters.customStart);
    const end = parseLocalDateKey(filters.customEnd);
    if (start > end)
      return { start: 0, end: 0, error: "结束日期不能早于开始日期" };
    return {
      start: start.getTime(),
      end: addLocalDays(end, 1).getTime(),
      error: null,
    };
  } catch {
    return { start: 0, end: 0, error: "日期范围无效" };
  }
}

function filterByBounds(
  sessions: FocusSessionRecord[],
  start: number,
  end: number,
): FocusSessionRecord[] {
  return sessions.filter((item) => {
    const value = validTimestamp(item);
    return value !== null && value >= start && value < end;
  });
}

function filterForView(
  sessions: FocusSessionRecord[],
  filters: FocusFilters,
  now: Date,
): {
  sessions: FocusSessionRecord[];
  error: string | null;
  start: number | null;
  end: number | null;
} {
  if (filters.view === "all")
    return { sessions: [...sessions], error: null, start: null, end: null };
  if (filters.view === "custom") {
    const bounds = customBounds(filters);
    return {
      sessions: bounds.error
        ? []
        : filterByBounds(sessions, bounds.start, bounds.end),
      error: bounds.error,
      start: bounds.error ? null : bounds.start,
      end: bounds.error ? null : bounds.end,
    };
  }
  const bounds = boundsForView(filters.view, now);
  return {
    sessions: filterByBounds(sessions, bounds.start, bounds.end),
    error: null,
    start: bounds.start,
    end: bounds.end,
  };
}

function sumMinutes(sessions: FocusSessionRecord[]): number {
  return sessions.reduce(
    (sum, item) => sum + Math.max(0, item.durationMinutes),
    0,
  );
}

function countFocusDays(sessions: FocusSessionRecord[]): number {
  return new Set(
    sessions
      .filter((item) => validTimestamp(item) !== null)
      .map((item) => localDateKey(new Date(item.startAt))),
  ).size;
}

function buildSubjectDistribution(
  sessions: FocusSessionRecord[],
): FocusSubjectSlice[] {
  const grouped = new Map<string, number>();
  for (const item of sessions) {
    const name = item.taskName.trim() || "未命名事项";
    grouped.set(
      name,
      (grouped.get(name) ?? 0) + Math.max(0, item.durationMinutes),
    );
  }
  const sorted = [...grouped]
    .map(([name, minutes]) => ({ name, minutes }))
    .sort(
      (left, right) =>
        right.minutes - left.minutes || left.name.localeCompare(right.name),
    );
  const visible =
    sorted.length > 6
      ? [
          ...sorted.slice(0, 6),
          {
            name: "其他",
            minutes: sorted
              .slice(6)
              .reduce((sum, item) => sum + item.minutes, 0),
          },
        ]
      : sorted;
  const total = visible.reduce((sum, item) => sum + item.minutes, 0);
  return visible.map((item) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.minutes / total) * 1000) / 10 : 0,
  }));
}

function buildHourDistribution(
  sessions: FocusSessionRecord[],
): Array<{ hour: number; label: string; minutes: number }> {
  const minutes = Array.from({ length: 24 }, () => 0);
  for (const item of sessions) {
    const value = validTimestamp(item);
    if (value !== null) {
      const hour = new Date(value).getHours();
      minutes[hour] = (minutes[hour] ?? 0) + Math.max(0, item.durationMinutes);
    }
  }
  return minutes.map((value, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    minutes: value,
  }));
}

function mondayFor(value: Date): Date {
  return addLocalDays(value, -((value.getDay() + 6) % 7));
}

function buildTrend(
  sessions: FocusSessionRecord[],
  selectedRange?: { start: number; end: number },
): {
  points: FocusTrendPoint[];
  granularity: "day" | "week";
} {
  const valid = sessions
    .filter((item) => validTimestamp(item) !== null)
    .sort(
      (left, right) => Date.parse(left.startAt) - Date.parse(right.startAt),
    );
  if (valid.length === 0 && !selectedRange)
    return { points: [], granularity: "day" };
  const first = selectedRange
    ? localDayStart(new Date(selectedRange.start))
    : localDayStart(new Date(valid[0]!.startAt));
  const last = selectedRange
    ? localDayStart(new Date(selectedRange.end - 1))
    : localDayStart(new Date(valid[valid.length - 1]!.startAt));
  const daySpan =
    Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1;
  const granularity = daySpan > 120 ? "week" : "day";
  const grouped = new Map<string, number>();
  for (const item of valid) {
    const date = localDayStart(new Date(item.startAt));
    const key = localDateKey(granularity === "week" ? mondayFor(date) : date);
    grouped.set(
      key,
      (grouped.get(key) ?? 0) + Math.max(0, item.durationMinutes),
    );
  }
  const start = granularity === "week" ? mondayFor(first) : first;
  const end = granularity === "week" ? mondayFor(last) : last;
  const step = granularity === "week" ? 7 : 1;
  const points: FocusTrendPoint[] = [];
  for (let cursor = start; cursor <= end; cursor = addLocalDays(cursor, step)) {
    const key = localDateKey(cursor);
    points.push({
      key,
      label:
        granularity === "week"
          ? `${cursor.getMonth() + 1}月${cursor.getDate()}日`
          : `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      minutes: grouped.get(key) ?? 0,
    });
  }
  return { points, granularity };
}

export function buildFocusWorkspace(
  sessions: FocusSessionRecord[],
  filters: FocusFilters,
  now = new Date(),
): FocusWorkspaceModel {
  const validSessions = sessions.filter(
    (item) => validTimestamp(item) !== null,
  );
  const selected = filterForView(validSessions, filters, now);
  const todayBounds = boundsForView("today", now);
  const today = filterByBounds(
    validSessions,
    todayBounds.start,
    todayBounds.end,
  );
  const focusDays = countFocusDays(validSessions);
  const totalMinutes = sumMinutes(validSessions);
  const selectedDays = countFocusDays(selected.sessions);
  const selectedMinutes = sumMinutes(selected.sessions);
  const trend = buildTrend(
    selected.sessions,
    selected.start !== null && selected.end !== null
      ? { start: selected.start, end: selected.end }
      : undefined,
  );
  const viewCounts = Object.fromEntries(
    (["today", "week", "month", "all", "custom"] as const).map((view) => [
      view,
      filterForView(validSessions, { ...filters, view }, now).sessions.length,
    ]),
  ) as Record<FocusView, number>;

  return {
    filteredSessions: [...selected.sessions].sort(
      (left, right) => Date.parse(right.startAt) - Date.parse(left.startAt),
    ),
    rangeError: selected.error,
    viewCounts,
    metrics: {
      totalCount: validSessions.length,
      totalMinutes,
      focusDays,
      dailyAverageMinutes: focusDays ? Math.round(totalMinutes / focusDays) : 0,
      todayCount: today.length,
      todayMinutes: sumMinutes(today),
    },
    overview: {
      count: selected.sessions.length,
      minutes: selectedMinutes,
      focusDays: selectedDays,
      averageSessionMinutes: selected.sessions.length
        ? Math.round(selectedMinutes / selected.sessions.length)
        : 0,
    },
    subjects: buildSubjectDistribution(selected.sessions),
    hours: buildHourDistribution(selected.sessions),
    trend: trend.points,
    trendGranularity: trend.granularity,
  };
}

export function formatFocusMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}分钟`;
  if (!rest) return `${hours}小时`;
  return `${hours}小时${rest}分钟`;
}
