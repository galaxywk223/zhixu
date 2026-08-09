import { describe, expect, it } from "vitest";
import type { LifeEventRecord } from "../src/preload/api-types";
import {
  buildSleepWorkspace,
  formatSleepClock,
  type SleepFilters,
} from "../src/renderer/src/pages/sleep-workspace-model";

function event(
  id: string,
  kind: LifeEventRecord["kind"],
  date: Date,
): LifeEventRecord {
  return {
    id,
    sourceKey: id,
    source: "manual",
    kind,
    title: kind,
    occurredAt: date.toISOString(),
    note: null,
    importBatchId: null,
  };
}

function filters(
  view: SleepFilters["view"],
  customStart = "",
  customEnd = "",
): SleepFilters {
  return { view, customStart, customEnd };
}

describe("sleep workspace model", () => {
  const events = [
    event("isolated", "wake", new Date(2026, 7, 5, 8)),
    event("sleep-1", "sleep", new Date(2026, 7, 7, 23)),
    event("wake-1", "wake", new Date(2026, 7, 8, 7)),
    event("sleep-2", "sleep", new Date(2026, 7, 8, 23, 30)),
    event("wake-2", "wake", new Date(2026, 7, 9, 7, 30)),
  ];
  const now = new Date(2026, 7, 9, 12);

  it("assigns overnight sleep to the wake date and excludes issues from metrics", () => {
    const model = buildSleepWorkspace(events, filters("last7"), now);
    expect(model.metrics).toEqual({
      validCount: 2,
      averageDurationMinutes: 480,
      averageBedtimeMinutes: 1395,
      averageWakeMinutes: 1875,
      latestDurationMinutes: 480,
      issueCount: 1,
    });
    expect(model.overview).toEqual({
      count: 2,
      totalMinutes: 960,
      averageMinutes: 480,
      issueCount: 1,
    });
    expect(
      model.records
        .filter((record) => !record.issue)
        .map((record) => record.dateKey),
    ).toEqual(["2026-08-09", "2026-08-08"]);
    expect(formatSleepClock(model.metrics.averageBedtimeMinutes)).toBe("23:15");
    expect(formatSleepClock(model.metrics.averageWakeMinutes)).toBe("07:15");
  });

  it("fills the selected range and builds neutral duration buckets", () => {
    const model = buildSleepWorkspace(events, filters("last7"), now);
    expect(model.trend).toHaveLength(7);
    expect(model.trend[0]?.key).toBe("2026-08-03");
    expect(model.trend.at(-1)?.key).toBe("2026-08-09");
    expect(
      model.durationBuckets.find((item) => item.label === "8-9 小时")?.count,
    ).toBe(2);
  });

  it("uses inclusive custom dates and reports invalid ranges", () => {
    const selected = buildSleepWorkspace(
      events,
      filters("custom", "2026-08-08", "2026-08-08"),
      now,
    );
    expect(selected.overview.count).toBe(1);
    expect(
      selected.records.some((record) => record.dateKey === "2026-08-09"),
    ).toBe(false);

    const invalid = buildSleepWorkspace(
      events,
      filters("custom", "2026-08-09", "2026-08-08"),
      now,
    );
    expect(invalid.rangeError).toBe("结束日期不能早于开始日期");
    expect(invalid.records).toEqual([]);
    expect(invalid.trend).toEqual([]);
  });
});
