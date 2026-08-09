// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../src/main/database";
import { ZhixuStore } from "../src/main/store";
import type { TomatoImportRow, TomatoPreview } from "../src/preload/api-types";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function createStore(): {
  store: ZhixuStore;
  context: ReturnType<typeof initializeDatabase>;
} {
  const root = mkdtempSync(join(tmpdir(), "zhixu-tomato-test-"));
  directories.push(root);
  const context = initializeDatabase({
    source: join(root, "legacy.sqlite"),
    target: join(root, "data", "zhixu.sqlite"),
    backups: join(root, "backups"),
  });
  return { store: new ZhixuStore(context.db), context };
}

function row(
  sourceRow: number,
  overrides: Partial<TomatoImportRow> = {},
): TomatoImportRow {
  return {
    sourceRow,
    sourceKey: `v3:key-${sourceRow}`,
    legacySourceKey: `legacy-key-${sourceRow}`,
    startAt: `2026-08-0${sourceRow}T01:00:00.000Z`,
    endAt: `2026-08-0${sourceRow}T01:25:00.000Z`,
    taskName: "算法复习",
    durationMinutes: 25,
    reflection: null,
    status: "已完成",
    classification: "focus",
    action: "error",
    reason: null,
    warnings: [],
    ...overrides,
  };
}

function preview(rows: TomatoImportRow[]): TomatoPreview {
  return {
    token: "preview-token",
    fileName: "history.xls",
    fileHash: "fixture-hash",
    exportUser: "测试用户",
    declaredMinutes: rows
      .filter((item) => item.classification === "focus")
      .reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0),
    declaredRecords: rows.length,
    rangeStart: "2026-08-01T00:00:00.000Z",
    rangeEnd: "2026-08-09T00:00:00.000Z",
    calculatedMinutes: rows
      .filter((item) => item.classification === "focus")
      .reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0),
    focusCount: rows.filter((item) => item.classification === "focus").length,
    lifeEventCount: rows.filter((item) => item.classification === "life_event")
      .length,
    counts: {
      create: 0,
      update: 0,
      unchanged: 0,
      reconcile: 0,
      excluded: 0,
      error: 0,
    },
    canCommit: false,
    rows,
  };
}

describe("Tomato TODO database-aware import", () => {
  it("previews, imports, and repeatedly skips valid focus and life rows", () => {
    const { store, context } = createStore();
    const input = preview([
      row(1),
      row(2, {
        taskName: "睡眠",
        durationMinutes: 0,
        classification: "life_event",
      }),
      row(3, {
        status: "中途放弃",
        classification: "excluded",
        reason: "中途放弃",
      }),
    ]);

    expect(store.previewTomatoImport(input)).toMatchObject({
      canCommit: true,
      counts: { create: 2, excluded: 1, error: 0 },
    });
    const first = store.importTomato(input);
    expect(first).toMatchObject({
      importedCount: 2,
      focusImportedCount: 1,
      lifeEventImportedCount: 1,
      excludedCount: 1,
    });
    expect(store.listFocusSessions()).toHaveLength(1);
    expect(store.listLifeEvents()[0]).toMatchObject({
      title: "睡眠",
      kind: "sleep",
    });

    const repeated = store.previewTomatoImport(input);
    expect(repeated.counts).toMatchObject({ unchanged: 2, excluded: 1 });
    expect(store.importTomato(input)).toMatchObject({
      importedCount: 0,
      skippedCount: 2,
      excludedCount: 1,
    });
    context.db.close();
  });

  it("updates legacy aliases to canonical keys", () => {
    const { store, context } = createStore();
    const input = preview([row(1)]);
    const item = input.rows[0]!;
    context.db
      .prepare(
        `INSERT INTO focus_sessions
         (id, source_key, source, start_at, end_at, task_name, duration_minutes, status,
          created_at, updated_at, device_id, server_revision)
         VALUES ('legacy-focus', ?, 'tomatodo', 0, 0, '旧名称', 1, '已完成', 0, 0, 'legacy', 0)`,
      )
      .run(item.legacySourceKey);

    expect(store.previewTomatoImport(input).counts.update).toBe(1);
    expect(store.importTomato(input).updatedCount).toBe(1);
    expect(
      context.db
        .prepare(
          "SELECT source_key AS sourceKey, task_name AS taskName FROM focus_sessions WHERE id = 'legacy-focus'",
        )
        .get(),
    ).toEqual({ sourceKey: item.sourceKey, taskName: "算法复习" });
    context.db.close();
  });

  it("reconciles an abandoned imported focus row and rollback restores it", () => {
    const { store, context } = createStore();
    const abandoned = row(1, {
      status: "中途放弃",
      durationMinutes: 6,
      classification: "excluded",
      reason: "中途放弃",
    });
    context.db
      .prepare(
        `INSERT INTO focus_sessions
         (id, source_key, source, start_at, end_at, task_name, duration_minutes, status,
          created_at, updated_at, device_id, server_revision)
         VALUES ('abandoned-focus', ?, 'tomatodo', 0, 0, '算法复习', 6, '中途放弃', 0, 0, 'legacy', 0)`,
      )
      .run(abandoned.sourceKey);
    const input = preview([abandoned]);

    expect(store.previewTomatoImport(input).counts.reconcile).toBe(1);
    expect(store.importTomato(input)).toMatchObject({
      reconciledCount: 1,
      excludedCount: 1,
    });
    expect(store.listFocusSessions()).toHaveLength(0);
    const batch = store.listImportBatches()[0]!;
    store.rollbackImportBatch(batch.id);
    expect(store.listFocusSessions()).toEqual([
      expect.objectContaining({ id: "abandoned-focus", status: "中途放弃" }),
    ]);
    context.db.close();
  });

  it("rolls back all writes when a later row fails inside the transaction", () => {
    const { store, context } = createStore();
    context.db.exec(`
      CREATE TRIGGER reject_sleep BEFORE INSERT ON life_events
      WHEN NEW.title = '睡眠'
      BEGIN SELECT RAISE(ABORT, 'reject sleep'); END;
    `);
    const input = preview([
      row(1),
      row(2, {
        taskName: "睡眠",
        durationMinutes: 0,
        classification: "life_event",
      }),
    ]);

    expect(() => store.importTomato(input)).toThrow("reject sleep");
    expect(store.listFocusSessions()).toHaveLength(0);
    expect(store.listLifeEvents()).toHaveLength(0);
    expect(store.listImportBatches()).toHaveLength(0);
    context.db.close();
  });

  it("blocks commit when parser rows contain errors", () => {
    const { store, context } = createStore();
    const input = preview([
      row(1, {
        classification: "error",
        reason: "待办名称包含无法恢复的旧版编码文本",
      }),
    ]);
    expect(store.previewTomatoImport(input)).toMatchObject({
      canCommit: false,
      counts: { error: 1 },
    });
    expect(() => store.importTomato(input)).toThrow("预检包含错误");
    context.db.close();
  });
});
