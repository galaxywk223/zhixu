// @vitest-environment node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../src/main/database";
import { ZhixuStore } from "../src/main/store";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function temporaryPaths(): {
  root: string;
  source: string;
  target: string;
  backups: string;
} {
  const root = mkdtempSync(join(tmpdir(), "zhixu-electron-test-"));
  directories.push(root);
  return {
    root,
    source: join(root, "legacy.sqlite"),
    target: join(root, "new", "zhixu.sqlite"),
    backups: join(root, "backups"),
  };
}

function createLegacyDatabase(path: string, version: 1 | 2 | 3 | 4 | 5): void {
  const db = new Database(path);
  const projectColumn = version < 3 ? "project_id TEXT," : "";
  const externalColumns =
    version >= 2
      ? "external_source TEXT, external_key TEXT, created_by_import_batch_id TEXT,"
      : "";
  const categoryColumn = version >= 5 ? "category_id TEXT," : "";
  const tagColumns =
    version >= 5
      ? "normalized_name TEXT NOT NULL DEFAULT '', is_archived INTEGER NOT NULL DEFAULT 0, server_revision INTEGER NOT NULL DEFAULT 0,"
      : "";
  const tagLinkColumns =
    version >= 5
      ? "created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER, device_id TEXT NOT NULL DEFAULT 'legacy', server_revision INTEGER NOT NULL DEFAULT 0,"
      : "";
  db.exec(`
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, description_md TEXT, status TEXT NOT NULL DEFAULT 'todo',
      priority INTEGER NOT NULL DEFAULT 1, due_at INTEGER, estimated_minutes INTEGER NOT NULL DEFAULT 0,
      repeat_rule TEXT, ${projectColumn} parent_task_id TEXT, ${externalColumns} ${categoryColumn}
      completed_at INTEGER, is_archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO tasks(id,title,status,priority,estimated_minutes,is_archived,created_at,updated_at,deleted_at,device_id)
      VALUES ('legacy-task','保留任务','todo',2,45,0,1786078140,1786078140,NULL,'flutter');
    INSERT INTO tasks(id,title,status,priority,estimated_minutes,is_archived,created_at,updated_at,deleted_at,device_id)
      VALUES ('deleted-task','已删除任务','done',1,15,1,1786078140,1786078240,1786078240,'flutter');
    CREATE TABLE tags (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, ${tagColumns}
      color_hex TEXT NOT NULL DEFAULT '#38BDF8', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      deleted_at INTEGER, device_id TEXT NOT NULL
    );
    INSERT INTO tags(id,name,color_hex,created_at,updated_at,device_id)
      VALUES ('tag-1','  学习  ','#38BDF8',1786078140,1786078140,'flutter');
    CREATE TABLE tag_links (
      id TEXT PRIMARY KEY NOT NULL, tag_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      ${tagLinkColumns} CHECK (length(id) > 0)
    );
    INSERT INTO tag_links(id,tag_id,entity_type,entity_id)
      VALUES ('link-1','tag-1','task','legacy-task');
    CREATE TABLE focus_sessions (
      id TEXT PRIMARY KEY NOT NULL, source_key TEXT NOT NULL UNIQUE, source TEXT NOT NULL DEFAULT 'tomatodo',
      start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, task_name TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
      reflection TEXT, status TEXT NOT NULL, completion_percent INTEGER NOT NULL DEFAULT 0, linked_task_id TEXT,
      ${version < 3 ? "linked_project_id TEXT," : ""} import_batch_id TEXT, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO focus_sessions(
      id,source_key,start_at,end_at,task_name,duration_minutes,status,created_at,updated_at,device_id
    ) VALUES ('focus-1','legacy-focus',1786078140,1786079940,'中文专注',30,'completed',1786078140,1786079940,'flutter');
    CREATE TABLE sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      operation TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0, last_error TEXT
    );
    INSERT INTO sync_outbox(entity_type,entity_id,operation,payload_json,created_at)
      VALUES ('task','legacy-task','upsert','{"title":"旧状态"}',1786078140);
    INSERT INTO sync_outbox(entity_type,entity_id,operation,payload_json,created_at)
      VALUES ('task','legacy-task','upsert','{"title":"最终状态"}',1786078240);
    CREATE TABLE sync_cursors (entity_type TEXT PRIMARY KEY NOT NULL, cursor INTEGER);
    PRAGMA user_version = ${version};
  `);
  if (version < 3) {
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'project',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL
      );
      INSERT INTO projects(id,name,created_at,updated_at,device_id)
        VALUES ('project-1','旧项目',1786078140,1786078140,'flutter');
    `);
  }
  if (version >= 2) {
    db.exec(`
      CREATE TABLE life_events (
        id TEXT PRIMARY KEY NOT NULL, source_key TEXT NOT NULL UNIQUE, source TEXT NOT NULL DEFAULT 'tomatodo',
        kind TEXT NOT NULL DEFAULT 'other', title TEXT NOT NULL, occurred_at INTEGER NOT NULL, note TEXT,
        import_batch_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
        device_id TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO life_events(
        id,source_key,kind,title,occurred_at,created_at,updated_at,device_id
      ) VALUES ('sleep-1','legacy-sleep','sleep','睡觉',1786078140,1786078140,1786078140,'flutter');
      CREATE TABLE import_batch_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, operation TEXT NOT NULL, before_json TEXT, after_json TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  }
  db.close();
}

describe("schema 6 migration", () => {
  it.each([1, 2, 3, 4, 5] as const)(
    "copies and migrates v%i without changing the source file",
    (version) => {
      const paths = temporaryPaths();
      createLegacyDatabase(paths.source, version);
      const beforeHash = createHash("sha256")
        .update(readFileSync(paths.source))
        .digest("hex");
      const context = initializeDatabase(paths);
      expect(context.report.status).toBe("migrated");
      expect(context.report.fromVersion).toBe(version);
      expect(context.report.integrity).toBe("ok");
      expect(context.report.entityCounts.tasks).toBe(2);
      expect(new ZhixuStore(context.db).listTasks()[0]?.title).toBe("保留任务");
      expect(
        context.db.prepare("SELECT COUNT(*) AS count FROM sync_outbox").get(),
      ).toEqual({ count: 1 });
      expect(
        context.db
          .prepare("SELECT payload_json AS payload FROM sync_outbox")
          .get(),
      ).toEqual({ payload: '{"title":"最终状态"}' });
      expect(
        context.db.prepare("SELECT normalized_name AS name FROM tags").get(),
      ).toEqual({ name: "学习" });
      expect(
        context.db
          .prepare("SELECT deleted_at AS deletedAt FROM tasks WHERE id = ?")
          .get("deleted-task"),
      ).toEqual({ deletedAt: 1786078240 });
      context.db.close();
      expect(
        createHash("sha256").update(readFileSync(paths.source)).digest("hex"),
      ).toBe(beforeHash);
    },
  );

  it("is idempotent when schema 6 is opened again", () => {
    const paths = temporaryPaths();
    createLegacyDatabase(paths.source, 5);
    const first = initializeDatabase(paths);
    first.db.close();
    const second = initializeDatabase(paths);
    expect(second.report.status).toBe("current");
    expect(second.report.fromVersion).toBe(6);
    expect(second.report.entityCounts.tasks).toBe(2);
    expect(second.db.pragma("integrity_check", { simple: true })).toBe("ok");
    second.db.close();
  });

  it("keeps a corrupt source and diagnostic copy without leaking a handle", () => {
    const paths = temporaryPaths();
    writeFileSync(paths.source, Buffer.from("not-a-sqlite-database"));
    const beforeHash = createHash("sha256")
      .update(readFileSync(paths.source))
      .digest("hex");
    expect(() => initializeDatabase(paths)).toThrow();
    expect(existsSync(paths.target)).toBe(true);
    expect(
      createHash("sha256").update(readFileSync(paths.source)).digest("hex"),
    ).toBe(beforeHash);
    expect(() => rmSync(paths.target, { force: true })).not.toThrow();
  });

  it("creates a fresh database and supports local task writes", () => {
    const paths = temporaryPaths();
    const context = initializeDatabase(paths);
    const store = new ZhixuStore(context.db);
    const id = store.saveTask({
      title: "Electron 任务",
      descriptionMd: null,
      status: "todo",
      priority: 2,
      dueAt: null,
      estimatedMinutes: 30,
      categoryId: null,
      repeatRule: null,
      tagIds: [],
    });
    expect(
      store.listTasks().find((item) => item.id === id)?.estimatedMinutes,
    ).toBe(30);
    expect(context.db.pragma("user_version", { simple: true })).toBe(6);
    expect(store.integrityCheck()).toBe("ok");
    context.db.close();
  });
});
