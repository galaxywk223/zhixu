// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    close: () => context.db.close(),
  };
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

  it("merges a snapshot and keeps divergent notes for manual resolution", () => {
    const { store, repository, close } = setup();
    const noteId = store.saveNote({
      title: "本地标题",
      contentMd: "本地正文",
      isPinned: false,
    });
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
    expect(repository.conflictCount()).toBe(1);
    expect(store.listCountdowns()[0]?.title).toBe("考试");
    expect(
      repository.listPending().some((item) => item.entityType === "task"),
    ).toBe(true);
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

  it("resolves a note conflict by retaining both versions", () => {
    const { store, repository, close } = setup();
    const noteId = store.saveNote({
      title: "复盘",
      contentMd: "本地版本",
      isPinned: false,
    });
    repository.mergeInitialSnapshot({
      revision: 3,
      entities: {
        note: [
          {
            id: noteId,
            title: "复盘",
            content_md: "云端版本",
            is_pinned: false,
            created_at: "2026-08-10T01:00:00.000Z",
            updated_at: "2026-08-10T02:00:00.000Z",
            deleted_at: null,
            device_id: "remote",
            server_revision: 3,
          },
        ],
      },
    });
    const conflict = repository.listConflicts()[0]!;
    repository.resolveConflict(conflict.id, "both");
    const notes = store.listNotes();
    expect(notes).toHaveLength(2);
    expect(notes.find((item) => item.id === noteId)?.contentMd).toBe(
      "云端版本",
    );
    expect(notes.some((item) => item.title.includes("本地冲突副本"))).toBe(
      true,
    );
    expect(repository.conflictCount()).toBe(0);
    close();
  });
});
