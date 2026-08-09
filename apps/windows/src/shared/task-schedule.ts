import type { RecurrenceFrequency } from "@zhixu/contracts";
import { localDateKey, parseLocalDateKey } from "./local-date";

export { localDateKey } from "./local-date";

export const MAX_BATCH_TASKS = 366;

export function combineLocalDueAt(date: string, time: string | null): string {
  const value = parseLocalDateKey(date);
  if (time) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!match) throw new Error("时间格式无效");
    value.setHours(Number(match[1]), Number(match[2]), 0, 0);
  } else {
    value.setHours(23, 59, 59, 999);
  }
  return value.toISOString();
}

export function isImplicitEndOfDay(value: string): boolean {
  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getHours() === 23 &&
    date.getMinutes() === 59 &&
    date.getSeconds() === 59 &&
    date.getMilliseconds() === 999
  );
}

export function buildOccurrenceDates(
  startDate: string,
  endDate: string,
  frequency: RecurrenceFrequency,
  limit = MAX_BATCH_TASKS,
): string[] {
  const start = parseLocalDateKey(startDate);
  const end = parseLocalDateKey(endDate);
  if (end < start) throw new Error("结束日期不能早于开始日期");
  const result: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const weekday = cursor.getDay();
    if (frequency !== "weekdays" || (weekday !== 0 && weekday !== 6)) {
      result.push(localDateKey(cursor));
      if (result.length > limit)
        throw new Error(`一次最多创建 ${limit} 条任务`);
    }
    cursor.setDate(cursor.getDate() + (frequency === "weekly" ? 7 : 1));
  }
  if (result.length === 0) throw new Error("所选范围内没有可创建的任务");
  return result;
}
