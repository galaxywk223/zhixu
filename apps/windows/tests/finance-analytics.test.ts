// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "../src/main/database";
import { ZhixuStore } from "../src/main/store";

const directories: string[] = [];
const databases: Array<{ close(): void }> = [];

afterEach(() => {
  vi.useRealTimers();
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "zhixu-finance-analytics-test-"));
  directories.push(root);
  const context = initializeDatabase({
    source: join(root, "missing.sqlite"),
    target: join(root, "data", "zhixu.sqlite"),
    backups: join(root, "backups"),
  });
  databases.push(context.db);
  const store = new ZhixuStore(context.db, "finance-analytics-test-device");
  const insert = (
    id: string,
    transactedAt: Date,
    amountCents: number,
    platform: "alipay" | "wechat" = "alipay",
  ): void => {
    const timestamp = Math.floor(transactedAt.getTime() / 1000);
    context.db
      .prepare(
        `INSERT INTO finance_transactions (
          id, platform, source_key, transaction_id, transacted_at, amount_cents,
          raw_flow, raw_status, raw_type, counterparty, description,
          payment_method, raw_payload_json, analysis_kind, category, is_included,
          created_at, updated_at, device_id
        ) VALUES (?, ?, ?, ?, ?, ?, '支出', '交易成功', '商户消费', '测试商户',
          '测试消费', '余额', '{}', 'expense', '餐饮', 1, ?, ?, 'test-device')`,
      )
      .run(
        id,
        platform,
        `source-${id}`,
        `order-${id}`,
        timestamp,
        amountCents,
        timestamp,
        timestamp,
      );
  };
  return { context, store, insert };
}

describe("finance analytics date ranges", () => {
  it("caps current ranges and all metrics at the local current day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 12));
    const { store, insert } = setup();
    insert("jan", new Date(2026, 0, 31, 10), 10_000);
    insert("yesterday", new Date(2026, 7, 10, 10), 2_000, "wechat");
    insert("today", new Date(2026, 7, 11, 10), 3_000);
    insert("future", new Date(2026, 7, 12, 10), 40_000);

    const all = store.listFinance({
      view: "all",
      trendGranularity: "month",
    });
    expect(all.range).toEqual({ start: "2026-01-31", end: "2026-08-11" });
    expect(all.totalCount).toBe(3);
    expect(all.viewCounts.all).toBe(3);
    expect(all.metrics).toMatchObject({
      netCents: 15_000,
      dailyAverageCents: Math.round(15_000 / 193),
      monthNetCents: 5_000,
      todayNetCents: 3_000,
    });
    expect(
      all.overview.categories.reduce((sum, item) => sum + item.impactCents, 0),
    ).toBe(15_000);
    expect(all.overview.trend.at(-1)).toMatchObject({
      key: "2026-08-01",
      label: "2026/8",
      impactCents: 5_000,
    });

    const week = store.listFinance({ view: "week", trendGranularity: "day" });
    expect(week.range).toEqual({ start: "2026-08-10", end: "2026-08-11" });
    expect(week.metrics.dailyAverageCents).toBe(2_500);
    expect(week.overview.trend.map((item) => item.key)).toEqual([
      "2026-08-10",
      "2026-08-11",
    ]);

    const month = store.listFinance({
      view: "month",
      trendGranularity: "day",
    });
    expect(month.metrics.dailyAverageCents).toBe(Math.round(5_000 / 11));
    expect(month.overview.trend).toHaveLength(11);

    const year = store.listFinance({
      view: "year",
      trendGranularity: "month",
    });
    expect(year.metrics.dailyAverageCents).toBe(Math.round(15_000 / 223));
  });

  it("clamps future custom ends and keeps entirely future ranges empty", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 12));
    const { store, insert } = setup();
    insert("yesterday", new Date(2026, 7, 10, 10), 2_000);
    insert("today", new Date(2026, 7, 11, 10), 3_000);
    insert("future", new Date(2026, 7, 12, 10), 40_000);

    const current = store.listFinance({
      view: "custom",
      customStart: "2026-08-10",
      customEnd: "2026-08-20",
      trendGranularity: "day",
    });
    expect(current.range).toEqual({ start: "2026-08-10", end: "2026-08-11" });
    expect(current.totalCount).toBe(2);
    expect(current.metrics.dailyAverageCents).toBe(2_500);

    const future = store.listFinance({
      view: "custom",
      customStart: "2026-08-12",
      customEnd: "2026-08-20",
      trendGranularity: "week",
    });
    expect(future.range).toEqual({ start: null, end: null });
    expect(future.totalCount).toBe(0);
    expect(future.metrics.dailyAverageCents).toBe(0);
    expect(future.overview.trend).toEqual([]);
  });

  it("groups and zero-fills trends by local day, Monday week, and month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 12));
    const { store, insert } = setup();
    insert("jan", new Date(2026, 0, 31, 10), 1_000);
    insert("feb", new Date(2026, 1, 2, 10), 2_000);
    insert("aug", new Date(2026, 7, 10, 10), 3_000);

    const daily = store.listFinance({
      view: "custom",
      customStart: "2026-01-31",
      customEnd: "2026-02-02",
      trendGranularity: "day",
    });
    expect(daily.overview.trend).toEqual([
      { key: "2026-01-31", label: "1/31", impactCents: 1_000 },
      { key: "2026-02-01", label: "2/1", impactCents: 0 },
      { key: "2026-02-02", label: "2/2", impactCents: 2_000 },
    ]);

    const weekly = store.listFinance({
      view: "custom",
      customStart: "2026-01-31",
      customEnd: "2026-02-10",
      trendGranularity: "week",
    });
    expect(weekly.overview.trend).toEqual([
      { key: "2026-01-26", label: "1/26 周", impactCents: 1_000 },
      { key: "2026-02-02", label: "2/2 周", impactCents: 2_000 },
      { key: "2026-02-09", label: "2/9 周", impactCents: 0 },
    ]);

    const monthly = store.listFinance({
      view: "all",
      trendGranularity: "month",
    });
    expect(monthly.overview.trend[0]).toEqual({
      key: "2026-01-01",
      label: "2026/1",
      impactCents: 1_000,
    });
    expect(monthly.overview.trend[2]).toEqual({
      key: "2026-03-01",
      label: "2026/3",
      impactCents: 0,
    });
    expect(monthly.overview.trend.at(-1)).toEqual({
      key: "2026-08-01",
      label: "2026/8",
      impactCents: 3_000,
    });
  });
});
