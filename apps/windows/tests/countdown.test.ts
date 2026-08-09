import { describe, expect, it } from "vitest";
import type { CountdownRecord } from "../src/preload/api-types";
import {
  countdownDays,
  countdownLabel,
  countdownPreview,
  parseLocalDate,
  splitCountdowns,
} from "../src/shared/countdown";

function record(
  id: string,
  title: string,
  targetDate: string,
): CountdownRecord {
  return {
    id,
    title,
    targetDate,
    note: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("countdown date model", () => {
  it("uses local calendar days across month and year boundaries", () => {
    expect(countdownDays("2027-01-01", new Date(2026, 11, 31, 23, 50))).toBe(1);
    expect(countdownDays("2026-08-09", new Date(2026, 7, 9, 1))).toBe(0);
    expect(countdownDays("2026-08-08", new Date(2026, 7, 9, 1))).toBe(-1);
    expect(parseLocalDate("2024-02-29").getDate()).toBe(29);
    expect(() => parseLocalDate("2025-02-29")).toThrow("日期无效");
  });

  it("formats future, today, and past labels", () => {
    expect(countdownLabel(18)).toBe("还有 18 天");
    expect(countdownLabel(0)).toBe("就是今天");
    expect(countdownLabel(-3)).toBe("已过去 3 天");
  });

  it("sorts upcoming ascending and past dates by recency", () => {
    const result = splitCountdowns(
      [
        record("future-2", "复试", "2026-09-10"),
        record("past-2", "报名开始", "2026-08-01"),
        record("today", "四六级", "2026-08-09"),
        record("past-1", "确认信息", "2026-08-08"),
        record("future-1", "初试", "2026-08-20"),
      ],
      new Date(2026, 7, 9, 23, 59),
    );

    expect(result.upcoming.map((item) => item.id)).toEqual([
      "today",
      "future-1",
      "future-2",
    ]);
    expect(result.past.map((item) => item.id)).toEqual(["past-1", "past-2"]);
  });

  it("keeps today's dates plus the next three future dates in the preview", () => {
    const result = countdownPreview(
      [
        record("past", "已结束", "2026-08-08"),
        record("today", "今天截止", "2026-08-09"),
        record("future-4", "第四项", "2026-08-20"),
        record("future-2", "第二项", "2026-08-12"),
        record("future-1", "第一项", "2026-08-10"),
        record("future-3", "第三项", "2026-08-15"),
      ],
      new Date(2026, 7, 9, 12),
    );

    expect(result.map((item) => item.id)).toEqual([
      "today",
      "future-1",
      "future-2",
      "future-3",
    ]);
  });
});
