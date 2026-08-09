import { describe, expect, it } from "vitest";
import type { FocusSessionRecord } from "../src/preload/api-types";
import {
  buildFocusWorkspace,
  formatFocusMinutes,
  type FocusFilters,
} from "../src/renderer/src/pages/focus-workspace-model";
import { localDateKey } from "../src/shared/local-date";

function session(
  id: string,
  date: Date,
  minutes: number,
  taskName = "项目开发",
): FocusSessionRecord {
  return {
    id,
    sourceKey: id,
    startAt: date.toISOString(),
    endAt: new Date(date.getTime() + minutes * 60_000).toISOString(),
    taskName,
    durationMinutes: minutes,
    reflection: null,
    status: "已完成",
    importBatchId: null,
  };
}

function filters(
  view: FocusFilters["view"],
  customStart = "2026-08-01",
  customEnd = "2026-08-09",
): FocusFilters {
  return { view, customStart, customEnd };
}

describe("focus workspace model", () => {
  const now = new Date(2026, 7, 9, 20, 0);
  const rows = [
    session("today-1", new Date(2026, 7, 9, 14, 10), 70, "保研复习"),
    session("today-2", new Date(2026, 7, 9, 16, 5), 43),
    session("yesterday", new Date(2026, 7, 8, 11, 0), 92, "算法"),
    session("week", new Date(2026, 7, 3, 9, 0), 35, "英语"),
    session("older", new Date(2026, 6, 20, 9, 0), 60, "课程复习"),
  ];

  it("builds cumulative and current-range metrics from local days", () => {
    const model = buildFocusWorkspace(rows, filters("today"), now);
    expect(model.metrics).toEqual({
      totalCount: 5,
      totalMinutes: 300,
      focusDays: 4,
      dailyAverageMinutes: 75,
      todayCount: 2,
      todayMinutes: 113,
    });
    expect(model.overview).toEqual({
      count: 2,
      minutes: 113,
      focusDays: 1,
      averageSessionMinutes: 57,
    });
    expect(model.viewCounts.today).toBe(2);
    expect(model.viewCounts.week).toBe(4);
    expect(model.viewCounts.month).toBe(4);
    expect(model.viewCounts.all).toBe(5);
  });

  it("includes both custom date boundaries and reports invalid ranges", () => {
    const inclusive = buildFocusWorkspace(
      rows,
      filters("custom", "2026-08-08", "2026-08-09"),
      now,
    );
    expect(inclusive.filteredSessions.map((item) => item.id)).toEqual([
      "today-2",
      "today-1",
      "yesterday",
    ]);
    expect(inclusive.rangeError).toBeNull();

    const invalid = buildFocusWorkspace(
      rows,
      filters("custom", "2026-08-09", "2026-08-08"),
      now,
    );
    expect(invalid.filteredSessions).toEqual([]);
    expect(invalid.rangeError).toBe("结束日期不能早于开始日期");
  });

  it("merges small subject slices and groups duration by start hour", () => {
    const manySubjects = Array.from({ length: 8 }, (_, index) =>
      session(
        `subject-${index}`,
        new Date(2026, 7, 9, index < 2 ? 14 : index + 8, 0),
        80 - index * 5,
        `事项${index + 1}`,
      ),
    );
    const model = buildFocusWorkspace(manySubjects, filters("all"), now);
    expect(model.subjects).toHaveLength(7);
    expect(model.subjects.at(-1)?.name).toBe("其他");
    expect(model.subjects.at(-1)?.minutes).toBe(95);
    expect(model.hours[14]?.minutes).toBe(205);
    expect(
      Math.round(
        model.subjects.reduce((sum, item) => sum + item.percentage, 0),
      ),
    ).toBe(100);
  });

  it("keeps the full history and changes long trends to weekly buckets", () => {
    const longHistory = [
      session("first", new Date(2026, 0, 1, 10, 0), 30),
      session("last", new Date(2026, 7, 9, 10, 0), 45),
    ];
    const model = buildFocusWorkspace(longHistory, filters("today"), now);
    expect(model.trendGranularity).toBe("week");
    expect(model.trend[0]?.minutes).toBe(30);
    expect(model.trend.at(-1)?.minutes).toBe(45);
    expect(model.trend.length).toBeGreaterThan(30);
    expect(model.trend.some((item) => item.minutes === 0)).toBe(true);
  });

  it("formats compact hour and minute values", () => {
    expect(formatFocusMinutes(0)).toBe("0分钟");
    expect(formatFocusMinutes(43)).toBe("43分钟");
    expect(formatFocusMinutes(120)).toBe("2小时");
    expect(formatFocusMinutes(630)).toBe("10小时30分钟");
    expect(localDateKey(now)).toBe("2026-08-09");
  });
});
