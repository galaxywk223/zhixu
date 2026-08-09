import type { CountdownRecord } from "../preload/api-types";

const DAY_MS = 86_400_000;

export function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("日期格式无效");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    throw new Error("日期无效");
  return date;
}

export function localDateKey(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

export function countdownDays(targetDate: string, now = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = parseLocalDate(targetDate);
  const targetDay = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  return Math.round((targetDay - today) / DAY_MS);
}

export function countdownLabel(days: number): string {
  if (days === 0) return "就是今天";
  return days > 0 ? `还有 ${days} 天` : `已过去 ${Math.abs(days)} 天`;
}

export function splitCountdowns(
  records: CountdownRecord[],
  now = new Date(),
): { upcoming: CountdownRecord[]; past: CountdownRecord[] } {
  const upcoming = records
    .filter((item) => countdownDays(item.targetDate, now) >= 0)
    .sort(
      (left, right) =>
        left.targetDate.localeCompare(right.targetDate) ||
        left.title.localeCompare(right.title, "zh-CN"),
    );
  const past = records
    .filter((item) => countdownDays(item.targetDate, now) < 0)
    .sort(
      (left, right) =>
        right.targetDate.localeCompare(left.targetDate) ||
        left.title.localeCompare(right.title, "zh-CN"),
    );
  return { upcoming, past };
}

export function countdownPreview(
  records: CountdownRecord[],
  now = new Date(),
): CountdownRecord[] {
  const upcoming = splitCountdowns(records, now).upcoming;
  return [
    ...upcoming.filter((item) => countdownDays(item.targetDate, now) === 0),
    ...upcoming
      .filter((item) => countdownDays(item.targetDate, now) > 0)
      .slice(0, 3),
  ];
}
