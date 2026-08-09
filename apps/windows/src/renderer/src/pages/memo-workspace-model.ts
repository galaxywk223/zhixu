import type { MemoRecord } from "../../../preload/api-types";

export type MemoView = "all" | "high" | "medium" | "low";

export interface MemoFilters {
  view: MemoView;
  query: string;
  categoryId: string;
  tagId: string;
}

export interface MemoWorkspaceModel {
  filtered: MemoRecord[];
  viewCounts: Record<MemoView, number>;
  categoryCounts: Record<string, number>;
  tagCounts: Record<string, number>;
  metrics: {
    total: number;
    high: number;
    medium: number;
    low: number;
    categories: number;
    tags: number;
  };
  overview: {
    count: number;
    high: number;
    categories: number;
    tags: number;
  };
}

export const DEFAULT_MEMO_FILTERS: MemoFilters = {
  view: "all",
  query: "",
  categoryId: "all",
  tagId: "all",
};

export const MEMO_VIEW_LABELS: Record<MemoView, string> = {
  all: "全部备忘",
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
};

function priorityForView(view: MemoView): number | null {
  if (view === "high") return 3;
  if (view === "medium") return 2;
  if (view === "low") return 1;
  return null;
}

export function buildMemoWorkspace(
  memos: MemoRecord[],
  filters: MemoFilters,
): MemoWorkspaceModel {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("zh-CN");
  const selectedPriority = priorityForView(filters.view);
  const filtered = memos
    .filter((memo) => {
      if (selectedPriority !== null && memo.priority !== selectedPriority)
        return false;
      if (
        filters.categoryId !== "all" &&
        memo.categoryId !== filters.categoryId
      )
        return false;
      if (filters.tagId !== "all" && !memo.tagIds.includes(filters.tagId))
        return false;
      if (!normalizedQuery) return true;
      return `${memo.title} ${memo.descriptionMd ?? ""}`
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery);
    })
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        right.updatedAt.localeCompare(left.updatedAt),
    );
  const viewCounts = Object.fromEntries(
    (["all", "high", "medium", "low"] as const).map((view) => {
      const priority = priorityForView(view);
      return [
        view,
        priority === null
          ? memos.length
          : memos.filter((memo) => memo.priority === priority).length,
      ];
    }),
  ) as Record<MemoView, number>;
  const categoryCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  for (const memo of memos) {
    if (memo.categoryId)
      categoryCounts[memo.categoryId] =
        (categoryCounts[memo.categoryId] ?? 0) + 1;
    for (const tagId of memo.tagIds)
      tagCounts[tagId] = (tagCounts[tagId] ?? 0) + 1;
  }
  return {
    filtered,
    viewCounts,
    categoryCounts,
    tagCounts,
    metrics: {
      total: memos.length,
      high: viewCounts.high,
      medium: viewCounts.medium,
      low: viewCounts.low,
      categories: Object.keys(categoryCounts).length,
      tags: Object.keys(tagCounts).length,
    },
    overview: {
      count: filtered.length,
      high: filtered.filter((memo) => memo.priority === 3).length,
      categories: new Set(
        filtered.map((memo) => memo.categoryId).filter(Boolean),
      ).size,
      tags: new Set(filtered.flatMap((memo) => memo.tagIds)).size,
    },
  };
}
