import type { LifeEventRecord } from "../../../preload/api-types";
import { buildSleepRecords, type SleepRecord } from "../../../shared/domain";
import {
  addLocalDays,
  localDateKey,
  localDayStart,
  parseLocalDateKey,
} from "../../../shared/local-date";

export type SleepView = "last7" | "last30" | "all" | "custom";

export interface SleepFilters {
  view: SleepView;
  customStart: string;
  customEnd: string;
}

export interface SleepWorkspaceRecord extends SleepRecord {
  key: string;
  dateKey: string;
  bedtimeMinutes: number | null;
  wakeMinutes: number | null;
}

export interface SleepTrendPoint {
  key: string;
  label: string;
  bedtimeMinutes: number | null;
  wakeMinutes: number | null;
  durationMinutes: number | null;
}

export interface SleepWorkspaceModel {
  rangeError: string | null;
  viewCounts: Record<SleepView, number>;
  metrics: {
    validCount: number;
    averageDurationMinutes: number;
    averageBedtimeMinutes: number | null;
    averageWakeMinutes: number | null;
    latestDurationMinutes: number | null;
    issueCount: number;
  };
  overview: {
    count: number;
    totalMinutes: number;
    averageMinutes: number;
    issueCount: number;
  };
  records: SleepWorkspaceRecord[];
  events: LifeEventRecord[];
  trend: SleepTrendPoint[];
  durationBuckets: Array<{ label: string; count: number }>;
}

export const DEFAULT_SLEEP_FILTERS: SleepFilters = {
  view: "last30",
  customStart: "",
  customEnd: "",
};

export const SLEEP_VIEW_LABELS: Record<SleepView, string> = {
  last7: "近 7 天",
  last30: "近 30 天",
  all: "全部",
  custom: "自定义",
};

interface DateRange {
  start: number | null;
  end: number | null;
  error: string | null;
}

function rangeForFilters(filters: SleepFilters, now: Date): DateRange {
  const today = localDayStart(now);
  if (filters.view === "all") return { start: null, end: null, error: null };
  if (filters.view === "last7" || filters.view === "last30") {
    const days = filters.view === "last7" ? 7 : 30;
    return {
      start: addLocalDays(today, -(days - 1)).getTime(),
      end: addLocalDays(today, 1).getTime(),
      error: null,
    };
  }
  if (!filters.customStart || !filters.customEnd)
    return { start: null, end: null, error: "请选择完整的起止日期" };
  try {
    const start = parseLocalDateKey(filters.customStart);
    const end = parseLocalDateKey(filters.customEnd);
    if (start > end)
      return { start: null, end: null, error: "结束日期不能早于开始日期" };
    return {
      start: start.getTime(),
      end: addLocalDays(end, 1).getTime(),
      error: null,
    };
  } catch {
    return { start: null, end: null, error: "日期范围无效" };
  }
}

function eventDate(record: SleepRecord): Date | null {
  const value = record.end?.occurredAt ?? record.start?.occurredAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scheduleMinutes(record: SleepRecord): {
  bedtimeMinutes: number | null;
  wakeMinutes: number | null;
} {
  if (!record.start || !record.end || record.issue) {
    return { bedtimeMinutes: null, wakeMinutes: null };
  }
  const start = new Date(record.start.occurredAt);
  const end = new Date(record.end.occurredAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return { bedtimeMinutes: null, wakeMinutes: null };
  const startClock = start.getHours() * 60 + start.getMinutes();
  const endClock = end.getHours() * 60 + end.getMinutes();
  const bedtimeMinutes = startClock < 12 * 60 ? startClock + 1440 : startClock;
  let wakeMinutes = endClock;
  while (wakeMinutes <= bedtimeMinutes) wakeMinutes += 1440;
  return { bedtimeMinutes, wakeMinutes };
}

function enrichRecords(events: LifeEventRecord[]): SleepWorkspaceRecord[] {
  return buildSleepRecords(events).map((record, index) => {
    const date = eventDate(record);
    const schedule = scheduleMinutes(record);
    return {
      ...record,
      key: `${record.start?.id ?? "none"}-${record.end?.id ?? index}`,
      dateKey: date ? localDateKey(date) : "",
      ...schedule,
    };
  });
}

function recordInRange(
  record: SleepWorkspaceRecord,
  range: DateRange,
): boolean {
  if (range.error || !record.dateKey) return false;
  if (range.start === null || range.end === null) return true;
  const value = parseLocalDateKey(record.dateKey).getTime();
  return value >= range.start && value < range.end;
}

function eventInRange(event: LifeEventRecord, range: DateRange): boolean {
  if (range.error) return false;
  if (range.start === null || range.end === null) return true;
  const value = Date.parse(event.occurredAt);
  return Number.isFinite(value) && value >= range.start && value < range.end;
}

function validRecords(records: SleepWorkspaceRecord[]): SleepWorkspaceRecord[] {
  return records.filter(
    (record) =>
      !record.issue &&
      record.durationMinutes !== null &&
      record.bedtimeMinutes !== null &&
      record.wakeMinutes !== null,
  );
}

function average(values: number[]): number {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function buildTrend(
  records: SleepWorkspaceRecord[],
  range: DateRange,
): SleepTrendPoint[] {
  const valid = validRecords(records);
  if (!valid.length) return [];
  const byDate = new Map<string, SleepWorkspaceRecord>();
  for (const record of valid) {
    const current = byDate.get(record.dateKey);
    if (
      !current ||
      (record.durationMinutes ?? 0) > (current.durationMinutes ?? 0)
    )
      byDate.set(record.dateKey, record);
  }
  const first =
    range.start === null
      ? parseLocalDateKey(valid.at(-1)!.dateKey)
      : localDayStart(new Date(range.start));
  const last =
    range.end === null
      ? parseLocalDateKey(valid[0]!.dateKey)
      : localDayStart(new Date(range.end - 1));
  const points: SleepTrendPoint[] = [];
  for (let cursor = first; cursor <= last; cursor = addLocalDays(cursor, 1)) {
    const key = localDateKey(cursor);
    const record = byDate.get(key);
    points.push({
      key,
      label: `${cursor.getMonth() + 1}/${cursor.getDate()}`,
      bedtimeMinutes: record?.bedtimeMinutes ?? null,
      wakeMinutes: record?.wakeMinutes ?? null,
      durationMinutes: record?.durationMinutes ?? null,
    });
  }
  return points;
}

function durationBuckets(records: SleepWorkspaceRecord[]): Array<{
  label: string;
  count: number;
}> {
  const buckets = [
    { label: "少于 6 小时", count: 0 },
    { label: "6-7 小时", count: 0 },
    { label: "7-8 小时", count: 0 },
    { label: "8-9 小时", count: 0 },
    { label: "9 小时以上", count: 0 },
  ];
  for (const record of validRecords(records)) {
    const minutes = record.durationMinutes!;
    const index =
      minutes < 360
        ? 0
        : minutes < 420
          ? 1
          : minutes < 480
            ? 2
            : minutes < 540
              ? 3
              : 4;
    buckets[index]!.count += 1;
  }
  return buckets;
}

export function buildSleepWorkspace(
  events: LifeEventRecord[],
  filters: SleepFilters,
  now = new Date(),
): SleepWorkspaceModel {
  const allRecords = enrichRecords(events);
  const range = rangeForFilters(filters, now);
  const records = allRecords.filter((record) => recordInRange(record, range));
  const selectedValid = validRecords(records);
  const allValid = validRecords(allRecords);
  const totalMinutes = selectedValid.reduce(
    (sum, record) => sum + record.durationMinutes!,
    0,
  );
  const latest = allValid[0];
  const viewCounts = Object.fromEntries(
    (["last7", "last30", "all", "custom"] as const).map((view) => {
      const viewRange = rangeForFilters({ ...filters, view }, now);
      return [
        view,
        validRecords(
          allRecords.filter((record) => recordInRange(record, viewRange)),
        ).length,
      ];
    }),
  ) as Record<SleepView, number>;

  return {
    rangeError: range.error,
    viewCounts,
    metrics: {
      validCount: allValid.length,
      averageDurationMinutes: average(
        allValid.map((record) => record.durationMinutes!),
      ),
      averageBedtimeMinutes: allValid.length
        ? average(allValid.map((record) => record.bedtimeMinutes!))
        : null,
      averageWakeMinutes: allValid.length
        ? average(allValid.map((record) => record.wakeMinutes!))
        : null,
      latestDurationMinutes: latest?.durationMinutes ?? null,
      issueCount: allRecords.filter((record) => record.issue).length,
    },
    overview: {
      count: selectedValid.length,
      totalMinutes,
      averageMinutes: selectedValid.length
        ? Math.round(totalMinutes / selectedValid.length)
        : 0,
      issueCount: records.filter((record) => record.issue).length,
    },
    records,
    events: events
      .filter((event) => eventInRange(event, range))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    trend: buildTrend(records, range),
    durationBuckets: durationBuckets(records),
  };
}

export function formatSleepMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}分钟`;
  if (!rest) return `${hours}小时`;
  return `${hours}小时${rest}分钟`;
}

export function formatSleepClock(minutes: number | null): string {
  if (minutes === null) return "—";
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}
