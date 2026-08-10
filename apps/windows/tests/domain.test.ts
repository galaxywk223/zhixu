import { describe, expect, it } from "vitest";
import type { LifeEventRecord, TaskRecord } from "../src/preload/api-types";
import {
  buildSleepRecords,
  groupTasks,
  taskGroupKind,
} from "../src/shared/domain";

function task(
  id: string,
  dueAt: string | null,
  status: TaskRecord["status"] = "todo",
): TaskRecord {
  return {
    id,
    title: id,
    descriptionMd: null,
    status,
    priority: 1,
    dueAt,
    estimatedMinutes: 0,
    categoryId: null,
    repeatRule: null,
    completedAt: null,
    isArchived: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    tagIds: [],
  };
}

function event(
  id: string,
  kind: LifeEventRecord["kind"],
  occurredAt: string,
): LifeEventRecord {
  return {
    id,
    sourceKey: id,
    source: "manual",
    kind,
    title: kind,
    occurredAt,
    note: null,
    importBatchId: null,
  };
}

describe("task date grouping", () => {
  const localTime = (day: number, hour: number, minute = 0): string =>
    new Date(2026, 7, day, hour, minute).toISOString();
  const now = new Date(2026, 7, 8, 12);

  it("uses local day boundaries and keeps completed tasks separate", () => {
    expect(taskGroupKind(task("late", localTime(7, 10)), now)).toBe("overdue");
    expect(taskGroupKind(task("today", localTime(8, 23, 59)), now)).toBe(
      "today",
    );
    expect(taskGroupKind(task("tomorrow", localTime(9, 0, 1)), now)).toBe(
      "tomorrow",
    );
    expect(taskGroupKind(task("done", null, "done"), now)).toBe("done");
    expect(
      groupTasks(
        [task("done", null, "done"), task("today", localTime(8, 9))],
        now,
      ).at(-1)?.kind,
    ).toBe("done");
  });
});

describe("sleep pairing", () => {
  it("pairs overnight sleep and reports isolated or overlong records", () => {
    const records = buildSleepRecords([
      event("sleep", "sleep", "2026-08-07T15:00:00.000Z"),
      event("wake", "wake", "2026-08-07T23:00:00.000Z"),
      event("isolated", "wake", "2026-08-08T02:00:00.000Z"),
      event("long-sleep", "sleep", "2026-08-08T03:00:00.000Z"),
      event("long-wake", "wake", "2026-08-09T05:00:00.000Z"),
    ]);
    expect(
      records.some(
        (record) => record.durationMinutes === 480 && record.issue === null,
      ),
    ).toBe(true);
    expect(records.some((record) => record.issue === "缺少睡觉记录")).toBe(
      true,
    );
    expect(
      records.some((record) => record.issue === "睡眠区间超过 24 小时"),
    ).toBe(true);
  });
});
