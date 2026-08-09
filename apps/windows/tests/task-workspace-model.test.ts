import { describe, expect, it } from "vitest";
import type { TaskRecord } from "../src/preload/api-types";
import {
  buildTaskWorkspace,
  DEFAULT_TASK_WORKSPACE_FILTERS,
  formatEstimatedMinutes,
  selectTaskView,
  sortWorkspaceTasks,
} from "../src/renderer/src/pages/task-workspace-model";

function task(id: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    title: id,
    descriptionMd: null,
    status: "todo",
    priority: 1,
    dueAt: new Date(2026, 7, 9, 23, 59).toISOString(),
    estimatedMinutes: 0,
    categoryId: null,
    repeatRule: null,
    completedAt: null,
    isArchived: false,
    createdAt: new Date(2026, 7, 1).toISOString(),
    updatedAt: new Date(2026, 7, 1).toISOString(),
    deletedAt: null,
    tagIds: [],
    ...overrides,
  };
}

describe("task workspace model", () => {
  const now = new Date(2026, 7, 9, 10, 0);
  const tasks = [
    task("overdue", {
      dueAt: new Date(2026, 7, 8, 23, 59).toISOString(),
      estimatedMinutes: 30,
    }),
    task("today", {
      dueAt: new Date(2026, 7, 9, 23, 59).toISOString(),
      estimatedMinutes: 45,
      categoryId: "study",
      tagIds: ["blue"],
    }),
    task("tomorrow", {
      status: "in_progress",
      dueAt: new Date(2026, 7, 10, 0, 0).toISOString(),
      estimatedMinutes: 60,
      tagIds: ["blue", "green"],
    }),
    task("next-week", {
      dueAt: new Date(2026, 7, 12, 12, 0).toISOString(),
      estimatedMinutes: 25,
    }),
    task("later", {
      dueAt: new Date(2026, 7, 20, 12, 0).toISOString(),
      estimatedMinutes: 20,
    }),
    task("undated", { dueAt: null, estimatedMinutes: 10 }),
    task("done", {
      status: "done",
      dueAt: new Date(2026, 7, 9, 8, 0).toISOString(),
      completedAt: new Date(2026, 7, 9, 9, 0).toISOString(),
      estimatedMinutes: 90,
    }),
  ];

  it("counts quick views and metrics at local date boundaries", () => {
    const model = buildTaskWorkspace(
      tasks,
      DEFAULT_TASK_WORKSPACE_FILTERS,
      "due",
      now,
    );

    expect(model.viewCounts).toMatchObject({
      active: 5,
      all: 6,
      overdue: 1,
      today: 1,
      tomorrow: 1,
      next7days: 1,
      done: 1,
    });
    expect(model.metrics).toEqual({
      total: 6,
      dueToday: 2,
      overdue: 1,
      completed: 1,
      pending: 5,
      remainingEstimatedMinutes: 180,
    });
    expect(formatEstimatedMinutes(180)).toBe("3 小时");
    expect(formatEstimatedMinutes(0)).toBe("0 分钟");
  });

  it("combines query, category, and tag filters", () => {
    const matching = task("matching", {
      title: "Alpha 复习",
      descriptionMd: "linear algebra",
      categoryId: "study",
      tagIds: ["blue", "green"],
    });
    const model = buildTaskWorkspace(
      [
        matching,
        task("wrong status", {
          title: "Alpha 完成",
          status: "done",
          categoryId: "study",
          tagIds: ["red"],
        }),
        task("wrong tag", {
          title: "Alpha 其他",
          categoryId: "study",
          tagIds: ["red"],
        }),
      ],
      {
        view: "all",
        query: "alpha",
        categoryId: "study",
        tagId: "blue",
      },
      "due",
      now,
    );

    expect(model.filteredTasks.map((item) => item.id)).toEqual(["matching"]);
    expect(model.tagCounts).toEqual({ blue: 1, green: 1, red: 2 });
  });

  it("preserves combination filters when changing quick views", () => {
    expect(
      selectTaskView(
        { ...DEFAULT_TASK_WORKSPACE_FILTERS, tagId: "blue" },
        "tomorrow",
      ),
    ).toMatchObject({
      view: "tomorrow",
      tagId: "blue",
    });
  });

  it("sorts by due date, priority, and recent update within a group", () => {
    const source = [
      task("low-early", {
        priority: 1,
        dueAt: new Date(2026, 7, 9, 9, 0).toISOString(),
        updatedAt: new Date(2026, 7, 2).toISOString(),
      }),
      task("high-late", {
        priority: 3,
        dueAt: new Date(2026, 7, 9, 18, 0).toISOString(),
        updatedAt: new Date(2026, 7, 3).toISOString(),
      }),
      task("medium-new", {
        priority: 2,
        dueAt: new Date(2026, 7, 9, 12, 0).toISOString(),
        updatedAt: new Date(2026, 7, 8).toISOString(),
      }),
    ];

    expect(sortWorkspaceTasks(source, "due").map((item) => item.id)).toEqual([
      "low-early",
      "medium-new",
      "high-late",
    ]);
    expect(
      sortWorkspaceTasks(source, "priority").map((item) => item.id),
    ).toEqual(["high-late", "medium-new", "low-early"]);
    expect(
      sortWorkspaceTasks(source, "updated").map((item) => item.id),
    ).toEqual(["medium-new", "high-late", "low-early"]);
  });
});
