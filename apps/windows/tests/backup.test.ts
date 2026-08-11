// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDatabase } from "../src/main/database";
import { BackupService } from "../src/main/services/backup";
import { ZhixuStore } from "../src/main/store";

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
  },
}));

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function setup(): {
  root: string;
  service: BackupService;
  store: ZhixuStore;
  db: Database.Database;
  close(): void;
} {
  const root = mkdtempSync(join(tmpdir(), "zhixu-backup-test-"));
  directories.push(root);
  const context = initializeDatabase({
    source: join(root, "missing.sqlite"),
    target: join(root, "data", "zhixu.sqlite"),
    backups: join(root, "migration-backups"),
  });
  const store = new ZhixuStore(context.db);
  return {
    root,
    service: new BackupService(store, "0.2.0"),
    store,
    db: context.db,
    close: () => context.db.close(),
  };
}

async function writeZip(
  path: string,
  files: Record<string, string>,
): Promise<void> {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(files)) zip.file(name, value);
  writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }));
}

function legacyPayload(version: number): Record<string, unknown> {
  return {
    schema_version: version,
    tasks: [
      {
        id: `backup-v${version}`,
        title: `备份版本 ${version}`,
        created_at: "2026-08-08T00:00:00.000Z",
        updated_at: "2026-08-08T00:00:00.000Z",
        device_id: "backup-test",
      },
    ],
  };
}

describe("backup compatibility", () => {
  it.each([1, 2, 3, 4, 5])("restores legacy v%i payloads", async (version) => {
    const context = setup();
    const backupPath = join(context.root, `legacy-v${version}.zip`);
    await writeZip(backupPath, {
      "manifest.json": JSON.stringify(legacyPayload(version)),
    });
    await expect(context.service.restoreFromPath(backupPath)).resolves.toBe(
      true,
    );
    expect(context.store.listMemos()[0]?.title).toBe(`备份版本 ${version}`);
    expect(context.store.integrityCheck()).toBe("ok");
    context.close();
  });

  it("restores a valid v6 payload with matching digest", async () => {
    const context = setup();
    const payload = JSON.stringify(legacyPayload(6));
    const backupPath = join(context.root, "schema-v6.zip");
    await writeZip(backupPath, {
      "manifest.json": JSON.stringify({
        schemaVersion: 6,
        appVersion: "0.2.0",
        exportedAt: "2026-08-08T00:00:00.000Z",
        payloadFile: "data.json",
        payloadSha256: createHash("sha256").update(payload).digest("hex"),
        entityCounts: { tasks: 1 },
      }),
      "data.json": payload,
    });
    await expect(context.service.restoreFromPath(backupPath)).resolves.toBe(
      true,
    );
    expect(context.store.listMemos()[0]?.title).toBe("备份版本 6");
    context.close();
  });

  it("rolls back when a v6 payload digest is invalid", async () => {
    const context = setup();
    context.store.saveTask({
      title: "恢复前任务",
      descriptionMd: null,
      status: "todo",
      priority: 1,
      dueAt: new Date(2026, 7, 9, 23, 59, 59, 999).toISOString(),
      estimatedMinutes: 0,
      categoryId: null,
      repeatRule: null,
      tagIds: [],
    });
    const backupPath = join(context.root, "invalid-v6.zip");
    await writeZip(backupPath, {
      "manifest.json": JSON.stringify({
        schemaVersion: 6,
        appVersion: "0.2.0",
        exportedAt: "2026-08-08T00:00:00.000Z",
        payloadFile: "data.json",
        payloadSha256: "0".repeat(64),
        entityCounts: { tasks: 0 },
      }),
      "data.json": JSON.stringify({ tasks: [] }),
    });
    await expect(context.service.restoreFromPath(backupPath)).rejects.toThrow(
      "SHA-256",
    );
    expect(context.store.listTasks()[0]?.title).toBe("恢复前任务");
    context.close();
  });

  it("round-trips countdowns and memo priority through schema 7", async () => {
    const source = setup();
    source.store.saveCountdown({
      title: "研究生考试",
      targetDate: "2026-12-20",
      note: "提前查看考场",
    });
    source.store.saveMemo({
      title: "高优先级备忘",
      descriptionMd: null,
      priority: 3,
      categoryId: null,
      tagIds: [],
    });
    const payload = JSON.stringify(source.store.exportData());
    const backupPath = join(source.root, "schema-v7.zip");
    await writeZip(backupPath, {
      "manifest.json": JSON.stringify({
        schemaVersion: 7,
        appVersion: "0.2.0",
        exportedAt: "2026-08-09T00:00:00.000Z",
        payloadFile: "data.json",
        payloadSha256: createHash("sha256").update(payload).digest("hex"),
        entityCounts: source.store.entityCounts(),
      }),
      "data.json": payload,
    });

    const target = setup();
    await expect(target.service.restoreFromPath(backupPath)).resolves.toBe(
      true,
    );
    expect(target.store.listCountdowns()[0]).toMatchObject({
      title: "研究生考试",
      targetDate: "2026-12-20",
      note: "提前查看考场",
    });
    expect(target.store.listMemos()[0]).toMatchObject({
      title: "高优先级备忘",
      priority: 3,
    });
    source.close();
    target.close();
  });

  it("writes schema 9 automatic backups with finance transactions and quotes", async () => {
    const source = setup();
    source.store.restoreData({
      finance_transactions: [
        {
          id: "finance-1",
          platform: "alipay",
          source_key: "source-1",
          transaction_id: "order-1",
          merchant_order_id: null,
          transacted_at: "2026-08-10T04:00:00.000Z",
          amount_cents: 1880,
          raw_flow: "支出",
          raw_status: "交易成功",
          raw_type: "餐饮美食",
          counterparty: "校园餐厅",
          counterparty_account: null,
          description: "午餐",
          payment_method: "余额",
          raw_note: null,
          raw_payload_json: "{}",
          analysis_kind: "expense",
          category: "餐饮",
          is_included: true,
          note: "保留人工备注",
          import_batch_id: null,
          created_at: "2026-08-10T04:00:00.000Z",
          updated_at: "2026-08-10T04:00:00.000Z",
          deleted_at: null,
          device_id: "backup-test",
          server_revision: 0,
        },
      ],
    });
    const quote = source.store.saveGeneratedQuote(
      "把今天走稳，远方自然会近。",
      "2026-08-11",
    );
    source.store.setDailyQuoteReaction(quote.id, "favorite");
    const backupPath = await source.service.createAutomaticBackup(
      join(source.root, "automatic"),
    );
    const zip = await JSZip.loadAsync(readFileSync(backupPath));
    const manifest = JSON.parse(
      await zip.file("manifest.json")!.async("string"),
    ) as { schemaVersion: number; entityCounts: Record<string, number> };
    expect(manifest.schemaVersion).toBe(9);
    expect(manifest.entityCounts.finance_transactions).toBe(1);
    expect(manifest.entityCounts.daily_quotes).toBe(1);

    const target = setup();
    await target.service.restoreFromPath(backupPath);
    expect(target.store.listFinance({ view: "all" }).records[0]).toMatchObject({
      counterparty: "校园餐厅",
      note: "保留人工备注",
      impactCents: 1880,
    });
    expect(target.store.listFavoriteQuotes()).toEqual([
      expect.objectContaining({
        text: "把今天走稳，远方自然会近。",
        reaction: "favorite",
      }),
    ]);
    source.close();
    target.close();
  });

  it("preserves legacy notes and versions without rebuilding note outbox", async () => {
    const source = setup();
    source.db
      .prepare(
        `INSERT INTO notes
         (id, title, content_md, notebook_id, is_pinned, created_at, updated_at,
          deleted_at, device_id, server_revision)
         VALUES ('legacy-note', '历史笔记', '保留正文', NULL, 0, 1, 2, 3,
          'legacy-device', 4)`,
      )
      .run();
    source.db
      .prepare(
        `INSERT INTO note_versions
         (id, note_id, title, content_md, created_at, source)
         VALUES ('legacy-version', 'legacy-note', '历史版本', '版本正文', 1, 'edit')`,
      )
      .run();

    const backupPath = await source.service.createAutomaticBackup(
      join(source.root, "automatic-notes"),
    );
    const target = setup();
    await target.service.restoreFromPath(backupPath);

    expect(
      target.db.prepare("SELECT * FROM notes WHERE id = 'legacy-note'").get(),
    ).toMatchObject({
      title: "历史笔记",
      content_md: "保留正文",
      deleted_at: 3,
    });
    expect(
      target.db
        .prepare("SELECT * FROM note_versions WHERE id = 'legacy-version'")
        .get(),
    ).toMatchObject({ title: "历史版本", content_md: "版本正文" });
    expect(
      target.db
        .prepare(
          "SELECT COUNT(*) AS count FROM sync_outbox WHERE entity_type = 'note'",
        )
        .get(),
    ).toEqual({ count: 0 });
    source.close();
    target.close();
  });
});
