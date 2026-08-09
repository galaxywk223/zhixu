import { describe, expect, it } from "vitest";
import {
  buildFocusByLocalDay,
  filterFocusByRange,
  groupFocusByLocalDate,
} from "../src/shared/focus-dates";
import { localDateKey } from "../src/shared/local-date";

function atLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

describe("focus local date grouping", () => {
  const now = new Date(2026, 7, 9, 20, 0);
  const sessions = [
    {
      id: "aug-9-late",
      startAt: atLocalTime(2026, 8, 9, 16, 1),
      durationMinutes: 43,
    },
    {
      id: "aug-9-early",
      startAt: atLocalTime(2026, 8, 9, 0, 5),
      durationMinutes: 70,
    },
    {
      id: "aug-8",
      startAt: atLocalTime(2026, 8, 8, 23, 59),
      durationMinutes: 20,
    },
  ];

  it("keeps records on their local natural day and sorts newest first", () => {
    const groups = groupFocusByLocalDate(sessions);
    expect(groups.map((group) => group.date)).toEqual([
      "2026-08-09",
      "2026-08-08",
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "aug-9-late",
      "aug-9-early",
    ]);
    expect(groups[0]?.totalMinutes).toBe(113);
  });

  it("uses local midnight for today and seven-day ranges", () => {
    expect(
      filterFocusByRange(sessions, "today", now).map((item) => item.id),
    ).toEqual(["aug-9-late", "aug-9-early"]);
    expect(filterFocusByRange(sessions, "7", now)).toHaveLength(3);
  });

  it("includes August 9 in the seven-day trend", () => {
    const trend = buildFocusByLocalDay(sessions, 7, now);
    expect(trend.at(-1)).toEqual({ date: "2026-08-09", minutes: 113 });
    expect(trend.map((item) => item.date)).toContain(localDateKey(now));
  });
});
