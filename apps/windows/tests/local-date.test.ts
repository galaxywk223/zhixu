import { describe, expect, it } from "vitest";
import {
  combineLocalDateTime,
  localDateTimeParts,
  parseLocalDateKey,
} from "../src/shared/local-date";

describe("local date fields", () => {
  it("round trips a local date and time without a UTC day shift", () => {
    const value = combineLocalDateTime("2026-08-09", "00:05");
    expect(localDateTimeParts(value)).toEqual({
      date: "2026-08-09",
      time: "00:05",
    });
  });

  it("rejects invalid local calendar dates", () => {
    expect(() => parseLocalDateKey("2026-02-30")).toThrow("日期无效");
  });
});
