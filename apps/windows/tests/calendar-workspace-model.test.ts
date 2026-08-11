import { describe, expect, it } from "vitest";
import type { FocusSessionRecord, TaskRecord } from "../src/preload/api-types";
import {
  buildCalendarMonth,
  buildFocusWeek,
  focusBlockContentLevel,
  focusTaskColorTone,
  mondayForDate,
} from "../src/renderer/src/pages/calendar-workspace-model";
import { localDateKey } from "../src/shared/local-date";

function task(
  id: string,
  due: Date,
  input: Partial<TaskRecord> = {},
): TaskRecord {
  return {
    id,
    title: id,
    descriptionMd: null,
    status: "todo",
    priority: 1,
    dueAt: due.toISOString(),
    estimatedMinutes: 0,
    categoryId: null,
    repeatRule: null,
    completedAt: null,
    isArchived: false,
    createdAt: due.toISOString(),
    updatedAt: due.toISOString(),
    deletedAt: null,
    tagIds: [],
    ...input,
  };
}

function session(
  id: string,
  start: Date,
  end: Date,
  durationMinutes: number,
): FocusSessionRecord {
  return {
    id,
    sourceKey: id,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    taskName: id,
    durationMinutes,
    reflection: null,
    status: "completed",
    importBatchId: null,
  };
}

describe("calendar workspace model", () => {
  it("builds a Monday-first 42-day month grid across month boundaries", () => {
    const model = buildCalendarMonth(
      [],
      new Date(2026, 7, 15),
      new Date(2026, 7, 9),
      new Date(2026, 7, 9),
    );

    expect(model.days).toHaveLength(42);
    expect(localDateKey(model.days[0]!.date)).toBe("2026-07-27");
    expect(localDateKey(model.days[41]!.date)).toBe("2026-09-06");
    expect(model.days.find((day) => day.key === "2026-08-09")?.isToday).toBe(
      true,
    );
  });

  it("sorts daily tasks, limits cell content, and calculates real metrics", () => {
    const morning = new Date(2026, 7, 9, 9);
    const noon = new Date(2026, 7, 9, 12);
    const items = [
      task("done", morning, { status: "done", priority: 3 }),
      task("low", morning, { priority: 1, estimatedMinutes: 20 }),
      task("high-late", noon, { priority: 3, estimatedMinutes: 40 }),
      task("high-early", morning, { priority: 3, estimatedMinutes: 30 }),
    ];
    const model = buildCalendarMonth(
      items,
      new Date(2026, 7, 1),
      new Date(2026, 7, 9),
    );
    const day = model.days.find((item) => item.key === "2026-08-09")!;

    expect(day.tasks.map((item) => item.id)).toEqual([
      "high-early",
      "high-late",
      "low",
      "done",
    ]);
    expect(day.visibleTasks).toHaveLength(3);
    expect(day.hiddenTaskCount).toBe(1);
    expect(model.selectedTasks).toHaveLength(4);
    expect(model.metrics).toEqual({
      completed: 1,
      total: 4,
      completionRate: 25,
      estimatedMinutes: 90,
      highPriority: 2,
    });
  });

  it("uses local Monday boundaries and expands the visible hour range", () => {
    const early = session(
      "early",
      new Date(2026, 7, 3, 6, 30),
      new Date(2026, 7, 3, 7, 10),
      40,
    );
    const late = session(
      "late",
      new Date(2026, 7, 7, 21, 50),
      new Date(2026, 7, 7, 22, 20),
      30,
    );
    const model = buildFocusWeek([early, late], new Date(2026, 7, 5));

    expect(localDateKey(mondayForDate(new Date(2026, 7, 9)))).toBe(
      "2026-08-03",
    );
    expect(localDateKey(model.start)).toBe("2026-08-03");
    expect(localDateKey(new Date(model.end.getTime() - 1))).toBe("2026-08-09");
    expect(model.timeline).toEqual({
      startMinutes: 360,
      endMinutes: 1380,
    });
    expect(model.metrics).toEqual({
      count: 2,
      minutes: 70,
      focusDays: 2,
      averageMinutes: 35,
    });
  });

  it("assigns overlapping sessions to lanes", () => {
    const model = buildFocusWeek(
      [
        session("first", new Date(2026, 7, 4, 9), new Date(2026, 7, 4, 10), 60),
        session(
          "second",
          new Date(2026, 7, 4, 9, 30),
          new Date(2026, 7, 4, 10, 30),
          60,
        ),
      ],
      new Date(2026, 7, 5),
    );
    const segments = model.days.find(
      (day) => day.key === "2026-08-04",
    )!.segments;

    expect(segments.map((item) => item.lane).sort()).toEqual([0, 1]);
    expect(segments.every((item) => item.laneCount === 2)).toBe(true);
  });

  it("splits cross-midnight sessions visually without duplicating metrics", () => {
    const overnight = session(
      "overnight",
      new Date(2026, 7, 4, 23, 30),
      new Date(2026, 7, 5, 0, 30),
      60,
    );
    const model = buildFocusWeek([overnight], new Date(2026, 7, 5));
    const first = model.days.find((day) => day.key === "2026-08-04")!;
    const second = model.days.find((day) => day.key === "2026-08-05")!;

    expect(first.segments[0]).toMatchObject({
      startMinutes: 1410,
      endMinutes: 1440,
      continuesToNextDay: true,
    });
    expect(second.segments[0]).toMatchObject({
      startMinutes: 0,
      endMinutes: 30,
      continuesFromPreviousDay: true,
    });
    expect(first.allocatedMinutes).toBe(30);
    expect(second.allocatedMinutes).toBe(30);
    expect(model.metrics.count).toBe(1);
    expect(model.metrics.minutes).toBe(60);
  });

  it("uses an empty state instead of an all-day timeline when the week is empty", () => {
    const model = buildFocusWeek([], new Date(2026, 7, 5));
    expect(model.timeline).toBeNull();
  });

  it("pads a short focus range without dynamically scaling the timeline", () => {
    const model = buildFocusWeek(
      [
        session(
          "short",
          new Date(2026, 7, 4, 13, 10),
          new Date(2026, 7, 4, 13, 30),
          20,
        ),
      ],
      new Date(2026, 7, 5),
    );

    expect(model.timeline).toEqual({
      startMinutes: 720,
      endMinutes: 840,
    });
  });

  it("uses stable task colors and reveals content only when it fits", () => {
    expect(focusTaskColorTone(" 算法 ")).toBe(focusTaskColorTone("算法"));
    expect(focusTaskColorTone("Algorithm")).toBe(
      focusTaskColorTone("algorithm"),
    );
    expect(focusTaskColorTone("算法")).not.toBe(focusTaskColorTone("英语"));
    expect(focusBlockContentLevel(4)).toBe("none");
    expect(focusBlockContentLevel(23)).toBe("none");
    expect(focusBlockContentLevel(24)).toBe("title");
    expect(focusBlockContentLevel(43)).toBe("title");
    expect(focusBlockContentLevel(44)).toBe("compact");
    expect(focusBlockContentLevel(63)).toBe("compact");
    expect(focusBlockContentLevel(64)).toBe("expanded");
  });
});
