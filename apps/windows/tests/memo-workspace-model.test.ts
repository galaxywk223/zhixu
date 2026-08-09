import { describe, expect, it } from "vitest";
import type { MemoRecord } from "../src/preload/api-types";
import {
  buildMemoWorkspace,
  DEFAULT_MEMO_FILTERS,
} from "../src/renderer/src/pages/memo-workspace-model";

function memo(id: string, input: Partial<MemoRecord> = {}): MemoRecord {
  return {
    id,
    title: id,
    descriptionMd: null,
    priority: 1,
    categoryId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    tagIds: [],
    ...input,
  };
}

describe("memo workspace model", () => {
  const rows = [
    memo("高优先级备忘", {
      priority: 3,
      categoryId: "study",
      tagIds: ["exam"],
    }),
    memo("中优先级备忘", { priority: 2, categoryId: "study" }),
    memo("低优先级备忘", {
      priority: 1,
      categoryId: "life",
      tagIds: ["daily"],
    }),
  ];

  it("builds real priority, category, and tag metrics", () => {
    const model = buildMemoWorkspace(rows, DEFAULT_MEMO_FILTERS);
    expect(model.metrics).toEqual({
      total: 3,
      high: 1,
      medium: 1,
      low: 1,
      categories: 2,
      tags: 2,
    });
    expect(model.viewCounts).toEqual({ all: 3, high: 1, medium: 1, low: 1 });
    expect(model.filtered.map((item) => item.priority)).toEqual([3, 2, 1]);
  });

  it("combines priority, category, tag, and text filters", () => {
    const model = buildMemoWorkspace(rows, {
      view: "high",
      query: "高优先级",
      categoryId: "study",
      tagId: "exam",
    });
    expect(model.filtered.map((item) => item.id)).toEqual(["高优先级备忘"]);
    expect(model.overview).toEqual({
      count: 1,
      high: 1,
      categories: 1,
      tags: 1,
    });
  });
});
