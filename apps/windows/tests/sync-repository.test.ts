// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../src/main/database";
import { SyncRepository } from "../src/main/services/sync-repository";
import { ZhixuStore } from "../src/main/store";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function setup(): {
  store: ZhixuStore;
  repository: SyncRepository;
  db: Database.Database;
  close(): void;
} {
  const root = mkdtempSync(join(tmpdir(), "zhixu-sync-test-"));
  directories.push(root);
  const context = initializeDatabase({
    source: join(root, "legacy.sqlite"),
    target: join(root, "data", "zhixu.sqlite"),
    backups: join(root, "backups"),
  });
  return {
    store: new ZhixuStore(context.db, "device-test"),
    repository: new SyncRepository(context.db, "device-test"),
    db: context.db,
    close: () => context.db.close(),
  };
}

function insertLegacyNote(
  db: Database.Database,
  id: string,
  title: string,
): void {
  db.prepare(
    `INSERT INTO notes
     (id, title, content_md, notebook_id, is_pinned, created_at, updated_at,
      deleted_at, device_id, server_revision)
     VALUES (?, ?, ?, NULL, 0, 1, 2, NULL, 'legacy-device', 1)`,
  ).run(id, title, `${title}正文`);
}

describe("sync repository", () => {
  it("coalesces entity changes and preserves a newer edit during acknowledgement", () => {
    const { store, repository, close } = setup();
    const id = store.saveTask({
      title: "第一版",
      dueAt: "2026-08-11T15:59:59.999Z",
      status: "todo",
      priority: 1,
      estimatedMinutes: 10,
      categoryId: null,
      descriptionMd: null,
      repeatRule: null,
      tagIds: [],
    });
    const first = repository.listPending()[0]!;
    store.saveTask({
      id,
      title: "第二版",
      dueAt: "2026-08-11T15:59:59.999Z",
      status: "todo",
      priority: 1,
      estimatedMinutes: 20,
      categoryId: null,
      descriptionMd: null,
      repeatRule: null,
      tagIds: [],
    });
    const second = repository.listPending()[0]!;
    expect(second.operationId).not.toBe(first.operationId);
    expect(second.payload.device_id).toBe("device-test");
    repository.acknowledge(first, 12);
    expect(repository.pendingCount()).toBe(1);
    expect(repository.listPending()[0]?.operationId).toBe(second.operationId);
    close();
  });

  it("ignores legacy notes in snapshots while merging active entities", () => {
    const { store, repository, db, close } = setup();
    const noteId = "legacy-note";
    insertLegacyNote(db, noteId, "本地标题");
    store.saveTask({
      title: "仅本地任务",
      dueAt: "2026-08-12T15:59:59.999Z",
      status: "todo",
      priority: 2,
      estimatedMinutes: 30,
      categoryId: null,
      descriptionMd: null,
      repeatRule: null,
      tagIds: [],
    });
    repository.mergeInitialSnapshot({
      revision: 8,
      entities: {
        note: [
          {
            id: noteId,
            title: "云端标题",
            content_md: "云端正文",
            is_pinned: true,
            created_at: "2026-08-10T01:00:00.000Z",
            updated_at: "2026-08-10T02:00:00.000Z",
            deleted_at: null,
            device_id: "remote",
            server_revision: 8,
          },
        ],
        countdown: [
          {
            id: "remote-countdown",
            title: "考试",
            target_date: "2026-12-20",
            note: null,
            created_at: "2026-08-10T01:00:00.000Z",
            updated_at: "2026-08-10T01:00:00.000Z",
            deleted_at: null,
            device_id: "remote",
            server_revision: 7,
          },
        ],
      },
    });
    expect(repository.cursor()).toBe(8);
    expect(
      db.prepare("SELECT title FROM notes WHERE id = ?").get(noteId),
    ).toEqual({ title: "本地标题" });
    expect(store.listCountdowns()[0]?.title).toBe("考试");
    expect(
      repository.listPending().some((item) => item.entityType === "task"),
    ).toBe(true);
    close();
  });

  it("excludes legacy note operations from pending synchronization", () => {
    const { store, repository, db, close } = setup();
    insertLegacyNote(db, "legacy-note", "历史笔记");
    db.prepare(
      `INSERT INTO sync_outbox
       (entity_type, entity_id, operation, payload_json, created_at,
        operation_id, base_revision, status)
       VALUES ('note', 'legacy-note', 'upsert', '{}', 1, 'legacy-note-op', 0, 'pending')`,
    ).run();
    store.saveTask({
      title: "待同步任务",
      dueAt: "2026-08-11T15:59:59.999Z",
      status: "todo",
      priority: 1,
      estimatedMinutes: 10,
      categoryId: null,
      descriptionMd: null,
      repeatRule: null,
      tagIds: [],
    });

    expect(repository.pendingCount()).toBe(1);
    expect(repository.listPending()).toHaveLength(1);
    expect(repository.listPending()[0]?.entityType).toBe("task");
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM sync_outbox WHERE entity_type = 'note'",
        )
        .get(),
    ).toEqual({ count: 1 });
    close();
  });

  it("merges finance transactions by platform and source key", () => {
    const { store, repository, close } = setup();
    repository.mergeInitialSnapshot({
      revision: 14,
      entities: {
        finance_transaction: [
          {
            id: "remote-finance",
            platform: "wechat",
            source_key: "wx-source",
            transaction_id: "wx-order",
            merchant_order_id: null,
            transacted_at: "2026-08-10T04:00:00.000Z",
            amount_cents: 2200,
            raw_flow: "支出",
            raw_status: "支付成功",
            raw_type: "商户消费",
            counterparty: "书店",
            counterparty_account: null,
            description: "教材",
            payment_method: "零钱",
            raw_note: null,
            raw_payload_json: "{}",
            analysis_kind: "expense",
            category: "教育",
            is_included: true,
            note: null,
            import_batch_id: null,
            created_at: "2026-08-10T04:00:00.000Z",
            updated_at: "2026-08-10T04:00:00.000Z",
            deleted_at: null,
            device_id: "remote",
            server_revision: 14,
          },
        ],
      },
    });
    expect(store.listFinance({ view: "all" }).records[0]).toMatchObject({
      id: "remote-finance",
      platform: "wechat",
      category: "教育",
      impactCents: 2200,
    });
    store.updateFinance({ id: "remote-finance", isIncluded: false });
    expect(repository.listPending()[0]).toMatchObject({
      entityType: "finance_transaction",
      entityId: "remote-finance",
    });
    close();
  });

  it("syncs daily quote feedback as an active entity", () => {
    const { store, repository, close } = setup();
    const quote = store.saveGeneratedQuote(
      "把今天走稳，远方自然会近。",
      "2026-08-11",
      { kind: "corpus", id: "saying-test", generationVersion: 2 },
    );
    store.setDailyQuoteReaction(quote.id, "favorite");
    expect(repository.listPending()[0]).toMatchObject({
      entityType: "daily_quote",
      entityId: quote.id,
      payload: expect.objectContaining({
        reaction: "favorite",
        source_kind: "corpus",
        source_id: "saying-test",
        generation_version: 2,
      }),
    });

    repository.applyChanges([
      {
        revision: 21,
        entity_type: "daily_quote",
        entity_id: "remote-quote",
        operation: "upsert",
        payload: {
          id: "remote-quote",
          text: "慢一点，才能听见真正重要的声音。",
          local_date: "2026-08-10",
          reaction: "disliked",
          source_kind: "corpus",
          source_id: "saying-remote",
          generation_version: 2,
          generated_at: "2026-08-10T00:00:00.000Z",
          created_at: "2026-08-10T00:00:00.000Z",
          updated_at: "2026-08-10T01:00:00.000Z",
          deleted_at: null,
          device_id: "remote",
          server_revision: 21,
        },
      },
    ]);
    expect(store.listDislikedQuotes()[0]).toMatchObject({
      id: "remote-quote",
      reaction: "disliked",
      sourceKind: "corpus",
      sourceId: "saying-remote",
      generationVersion: 2,
    });
    expect(repository.cursor()).toBe(21);
    close();
  });

  it("ignores remote note changes while advancing the global cursor", () => {
    const { repository, db, close } = setup();
    insertLegacyNote(db, "legacy-note", "保留本地笔记");

    expect(
      repository.applyChanges([
        {
          revision: 19,
          entity_type: "note",
          entity_id: "legacy-note",
          operation: "upsert",
          payload: {
            title: "云端笔记",
            content_md: "不应写入",
            updated_at: "2026-08-10T02:00:00.000Z",
          },
        },
      ]),
    ).toBe(19);
    expect(repository.cursor()).toBe(19);
    expect(
      db.prepare("SELECT title FROM notes WHERE id = 'legacy-note'").get(),
    ).toEqual({ title: "保留本地笔记" });
    close();
  });
});
