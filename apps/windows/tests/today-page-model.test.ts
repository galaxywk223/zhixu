import { describe, expect, it } from "vitest";
import type { TaskRecord } from "../src/preload/api-types";
import { buildTodayDashboard } from "../src/renderer/src/pages/today-page-model";

function task(id: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    title: id,
    descriptionMd: null,
    status: "todo",
    priority: 1,
    dueAt: null,
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

describe("today dashboard model", () => {
  const now = new Date(2026, 7, 9, 10, 0);

  it("groups overdue, due-today, and completed-today tasks without duplicates", () => {
    const model = buildTodayDashboard(
      [
        task("overdue", {
          priority: 3,
          dueAt: new Date(2026, 7, 8, 23, 59).toISOString(),
        }),
        task("today", {
          priority: 2,
          dueAt: new Date(2026, 7, 9, 16, 0).toISOString(),
        }),
        task("completed", {
          status: "done",
          dueAt: new Date(2026, 7, 9, 12, 0).toISOString(),
          completedAt: new Date(2026, 7, 9, 9, 0).toISOString(),
        }),
        task("completed-without-date", {
          status: "done",
          completedAt: new Date(2026, 7, 9, 8, 0).toISOString(),
        }),
        task("future", {
          dueAt: new Date(2026, 7, 10, 9, 0).toISOString(),
        }),
      ],
      now,
    );

    expect(model.todayTasks.map((item) => item.id)).toEqual([
      "overdue",
      "today",
      "completed",
      "completed-without-date",
    ]);
    expect(model.completedCount).toBe(2);
    expect(model.totalCount).toBe(4);
    expect(model.completionRate).toBe(50);
    expect(model.focusTask?.id).toBe("overdue");
  });

  it("sorts future unfinished tasks by deadline and excludes undated tasks", () => {
    const model = buildTodayDashboard(
      [
        task("later", {
          priority: 3,
          dueAt: new Date(2026, 7, 12, 8, 0).toISOString(),
        }),
        task("sooner", {
          dueAt: new Date(2026, 7, 10, 20, 0).toISOString(),
        }),
        task("undated"),
        task("finished", {
          status: "done",
          dueAt: new Date(2026, 7, 10, 7, 0).toISOString(),
        }),
      ],
      now,
    );

    expect(model.upcomingTasks.map((item) => item.id)).toEqual([
      "sooner",
      "later",
    ]);
  });

  it("uses local midnight as the boundary between today and upcoming", () => {
    const model = buildTodayDashboard(
      [
        task("today-start", {
          dueAt: new Date(2026, 7, 9, 0, 0).toISOString(),
        }),
        task("tomorrow-start", {
          dueAt: new Date(2026, 7, 10, 0, 0).toISOString(),
        }),
      ],
      now,
    );

    expect(model.todayTasks.map((item) => item.id)).toEqual(["today-start"]);
    expect(model.upcomingTasks.map((item) => item.id)).toEqual([
      "tomorrow-start",
    ]);
  });

  it("returns a zero completion rate for an empty day", () => {
    const model = buildTodayDashboard([], now);

    expect(model.totalCount).toBe(0);
    expect(model.completedCount).toBe(0);
    expect(model.completionRate).toBe(0);
    expect(model.focusTask).toBeNull();
  });
});
