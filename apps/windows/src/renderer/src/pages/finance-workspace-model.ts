import type {
  FinanceQuery,
  FinanceTrendGranularity,
  FinanceView,
} from "../../../preload/api-types";
import {
  addLocalDays,
  localDateKey,
  localDayStart,
  parseLocalDateKey,
} from "../../../shared/local-date";

export interface FinanceFilters {
  view: FinanceView;
  customStart: string;
  customEnd: string;
  trendGranularityByView: Partial<Record<FinanceView, FinanceTrendGranularity>>;
}

export const FINANCE_VIEW_LABELS: Record<FinanceView, string> = {
  today: "今天",
  week: "本周",
  month: "本月",
  year: "本年",
  all: "全部",
  custom: "自定义",
};

export function defaultFinanceFilters(now = new Date()): FinanceFilters {
  return {
    view: "month",
    customStart: localDateKey(addLocalDays(localDayStart(now), -29)),
    customEnd: localDateKey(now),
    trendGranularityByView: {},
  };
}

function customRangeDays(filters: FinanceFilters): number | null {
  try {
    const start = parseLocalDateKey(filters.customStart);
    const end = parseLocalDateKey(filters.customEnd);
    if (start > end) return null;
    return (
      Math.round(
        (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
          Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
          86_400_000,
      ) + 1
    );
  } catch {
    return null;
  }
}

export function defaultFinanceTrendGranularity(
  filters: FinanceFilters,
): FinanceTrendGranularity {
  if (["today", "week", "month"].includes(filters.view)) return "day";
  if (filters.view === "year" || filters.view === "all") return "month";
  const days = customRangeDays(filters);
  if (days === null || days <= 62) return "day";
  return days <= 730 ? "week" : "month";
}

export function financeTrendGranularityForFilters(
  filters: FinanceFilters,
): FinanceTrendGranularity {
  return (
    filters.trendGranularityByView[filters.view] ??
    defaultFinanceTrendGranularity(filters)
  );
}

export function financeQueryForFilters(
  filters: FinanceFilters,
  patch: Partial<FinanceQuery> = {},
): FinanceQuery {
  return {
    view: filters.view,
    customStart: filters.customStart,
    customEnd: filters.customEnd,
    trendGranularity: financeTrendGranularityForFilters(filters),
    inclusion: "all",
    sort: "time_desc",
    limit: 100,
    ...patch,
  };
}

export function formatFinanceCents(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}¥${(Math.abs(value) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function financeImpactTone(
  value: number,
): "positive" | "negative" | "zero" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "zero";
}
