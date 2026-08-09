import { describe, expect, it } from "vitest";
import {
  buildOccurrenceDates,
  combineLocalDueAt,
  isImplicitEndOfDay,
} from "../src/shared/task-schedule";

describe("task schedule helpers", () => {
  it("uses the local end of day when no time is provided", () => {
    const value = combineLocalDueAt("2026-08-09", null);
    const due = new Date(value);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(7);
    expect(due.getDate()).toBe(9);
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
    expect(isImplicitEndOfDay(value)).toBe(true);
    expect(isImplicitEndOfDay(combineLocalDueAt("2026-08-09", "21:30"))).toBe(
      false,
    );
  });

  it("builds inclusive daily, weekday, and weekly ranges", () => {
    expect(buildOccurrenceDates("2026-08-07", "2026-08-11", "daily")).toEqual([
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
    ]);
    expect(
      buildOccurrenceDates("2026-08-07", "2026-08-11", "weekdays"),
    ).toEqual(["2026-08-07", "2026-08-10", "2026-08-11"]);
    expect(buildOccurrenceDates("2026-08-07", "2026-08-28", "weekly")).toEqual([
      "2026-08-07",
      "2026-08-14",
      "2026-08-21",
      "2026-08-28",
    ]);
  });

  it("rejects reversed, invalid, and oversized ranges", () => {
    expect(() =>
      buildOccurrenceDates("2026-08-10", "2026-08-09", "daily"),
    ).toThrow("结束日期不能早于开始日期");
    expect(() =>
      buildOccurrenceDates("2026-02-30", "2026-03-01", "daily"),
    ).toThrow("日期无效");
    expect(() =>
      buildOccurrenceDates("2026-01-01", "2027-01-02", "daily"),
    ).toThrow("一次最多创建 366 条任务");
  });
});
