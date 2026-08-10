import type { FinanceQuery, FinanceView } from "../../../preload/api-types";
import {
  addLocalDays,
  localDateKey,
  localDayStart,
} from "../../../shared/local-date";

export interface FinanceFilters {
  view: FinanceView;
  customStart: string;
  customEnd: string;
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
  };
}

export function financeQueryForFilters(
  filters: FinanceFilters,
  patch: Partial<FinanceQuery> = {},
): FinanceQuery {
  return {
    view: filters.view,
    customStart: filters.customStart,
    customEnd: filters.customEnd,
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
