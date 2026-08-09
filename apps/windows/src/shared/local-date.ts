export function parseLocalDateKey(value: string): Date {
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
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDayStart(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addLocalDays(value: Date, amount: number): Date {
  const result = localDayStart(value);
  result.setDate(result.getDate() + amount);
  return result;
}

export function combineLocalDateTime(date: string, time: string): string {
  const value = parseLocalDateKey(date);
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error("时间格式无效");
  value.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return value.toISOString();
}

export function localDateTimeParts(value: string): {
  date: string;
  time: string;
} {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("日期时间无效");
  return {
    date: localDateKey(parsed),
    time: `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`,
  };
}
