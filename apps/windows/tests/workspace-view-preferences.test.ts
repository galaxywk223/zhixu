import { afterEach, describe, expect, it } from "vitest";
import {
  loadFocusFilters,
  loadFinanceFilters,
  loadMemoView,
  loadSleepFilters,
  loadTaskView,
  saveFocusFilters,
  saveFinanceFilters,
  saveMemoView,
  saveSleepFilters,
  saveTaskView,
  WORKSPACE_VIEW_PREFERENCES_KEY,
} from "../src/renderer/src/workspace-view-preferences";

afterEach(() => localStorage.clear());

describe("workspace view preferences", () => {
  it("keeps each workspace selection in the shared versioned record", () => {
    saveTaskView("overdue");
    saveMemoView("high");
    saveFocusFilters({
      view: "custom",
      customStart: "2026-08-01",
      customEnd: "2026-08-10",
    });
    saveSleepFilters({
      view: "last7",
      customStart: "2026-07-01",
      customEnd: "2026-07-07",
    });
    saveFinanceFilters({
      view: "year",
      customStart: "2026-01-01",
      customEnd: "2026-08-10",
      trendGranularityByView: { year: "month", custom: "week" },
    });

    expect(loadTaskView("active")).toBe("overdue");
    expect(loadMemoView("all")).toBe("high");
    expect(
      loadFocusFilters({ view: "today", customStart: "", customEnd: "" }),
    ).toEqual({
      view: "custom",
      customStart: "2026-08-01",
      customEnd: "2026-08-10",
    });
    expect(
      loadSleepFilters({ view: "last30", customStart: "", customEnd: "" }),
    ).toEqual({
      view: "last7",
      customStart: "2026-07-01",
      customEnd: "2026-07-07",
    });
    expect(
      loadFinanceFilters({
        view: "month",
        customStart: "",
        customEnd: "",
        trendGranularityByView: {},
      }),
    ).toEqual({
      view: "year",
      customStart: "2026-01-01",
      customEnd: "2026-08-10",
      trendGranularityByView: { year: "month", custom: "week" },
    });
  });

  it("falls back when stored JSON, enum values, or custom dates are invalid", () => {
    localStorage.setItem(WORKSPACE_VIEW_PREFERENCES_KEY, "not-json");
    expect(loadTaskView("active")).toBe("active");

    localStorage.setItem(
      WORKSPACE_VIEW_PREFERENCES_KEY,
      JSON.stringify({
        taskView: "missing",
        memoView: "missing",
        focus: {
          view: "custom",
          customStart: "2026-08-10",
          customEnd: "2026-08-01",
        },
        sleep: {
          view: "custom",
          customStart: "invalid",
          customEnd: "2026-08-10",
        },
        finance: {
          view: "custom",
          customStart: "bad-date",
          customEnd: "2026-08-10",
          trendGranularityByView: {
            today: "day",
            week: "invalid",
            month: "week",
          },
        },
      }),
    );

    expect(loadTaskView("today")).toBe("today");
    expect(loadMemoView("all")).toBe("all");
    expect(
      loadFocusFilters({
        view: "today",
        customStart: "2026-07-01",
        customEnd: "2026-07-31",
      }),
    ).toEqual({
      view: "today",
      customStart: "2026-07-01",
      customEnd: "2026-07-31",
    });
    expect(
      loadSleepFilters({ view: "last30", customStart: "", customEnd: "" }),
    ).toEqual({ view: "last30", customStart: "", customEnd: "" });
    expect(
      loadFinanceFilters({
        view: "month",
        customStart: "2026-08-01",
        customEnd: "2026-08-31",
        trendGranularityByView: {},
      }),
    ).toEqual({
      view: "month",
      customStart: "2026-08-01",
      customEnd: "2026-08-31",
      trendGranularityByView: { today: "day", month: "week" },
    });
  });
});
