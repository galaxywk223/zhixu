import { addLocalDays, localDateKey, localDayStart } from "./local-date";

export type FocusRange = "today" | "7" | "30" | "all";

export interface FocusDateItem {
  startAt: string;
  durationMinutes: number;
}

export interface FocusDateGroup<T extends FocusDateItem> {
  date: string;
  items: T[];
  totalMinutes: number;
}

export function focusRangeStart(range: FocusRange, now = new Date()): number {
  if (range === "all") return 0;
  const days = range === "today" ? 0 : Number(range) - 1;
  return addLocalDays(localDayStart(now), -days).getTime();
}

export function filterFocusByRange<T extends FocusDateItem>(
  items: T[],
  range: FocusRange,
  now = new Date(),
): T[] {
  if (range === "all") return [...items];
  const start = focusRangeStart(range, now);
  const end = addLocalDays(localDayStart(now), 1).getTime();
  return items.filter((item) => {
    const value = Date.parse(item.startAt);
    return value >= start && value < end;
  });
}

export function groupFocusByLocalDate<T extends FocusDateItem>(
  items: T[],
): FocusDateGroup<T>[] {
  const sorted = [...items].sort(
    (left, right) => Date.parse(right.startAt) - Date.parse(left.startAt),
  );
  const groups = new Map<string, T[]>();
  for (const item of sorted) {
    const key = localDateKey(new Date(item.startAt));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([date, grouped]) => ({
    date,
    items: grouped,
    totalMinutes: grouped.reduce(
      (sum, item) => sum + Math.max(0, item.durationMinutes),
      0,
    ),
  }));
}

export function buildFocusByLocalDay<T extends FocusDateItem>(
  items: T[],
  dayCount: number,
  now = new Date(),
): Array<{ date: string; minutes: number }> {
  const today = localDayStart(now);
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addLocalDays(today, index - dayCount + 1);
    const key = localDateKey(date);
    return {
      date: key,
      minutes: items
        .filter((item) => localDateKey(new Date(item.startAt)) === key)
        .reduce((sum, item) => sum + Math.max(0, item.durationMinutes), 0),
    };
  });
}

export function rangeForLatestFocus(
  startAt: string | undefined,
  now = new Date(),
): FocusRange {
  if (!startAt) return "all";
  const value = Date.parse(startAt);
  if (value >= focusRangeStart("today", now)) return "today";
  if (value >= focusRangeStart("7", now)) return "7";
  if (value >= focusRangeStart("30", now)) return "30";
  return "all";
}
