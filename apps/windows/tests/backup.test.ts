// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(context.store.listTasks()[0]?.title).toBe(`备份版本 ${version}`);
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
    expect(context.store.listTasks()[0]?.title).toBe("备份版本 6");
    context.close();
  });

  it("rolls back when a v6 payload digest is invalid", async () => {
    const context = setup();
    context.store.saveTask({
      title: "恢复前任务",
      descriptionMd: null,
      status: "todo",
      priority: 1,
      dueAt: null,
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
});
