import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { MigrationReport } from "../preload/api-types";

export const SCHEMA_VERSION = 8 as const;

const preservedTables = [
  "tasks",
  "task_categories",
  "task_items",
  "schedule_blocks",
  "notebooks",
  "notes",
  "note_versions",
  "tags",
  "tag_links",
  "reminders",
  "focus_sessions",
  "life_events",
  "countdowns",
  "import_batches",
  "import_batch_changes",
] as const;

export interface DatabasePaths {
  source: string;
  target: string;
  backups: string;
}

export interface DatabaseContext {
  db: Database.Database;
  report: MigrationReport;
  paths: DatabasePaths;
}

export function defaultDatabasePaths(): DatabasePaths {
  const roaming = process.env.APPDATA;
  const local = process.env.LOCALAPPDATA;
  if (!roaming || !local) throw new Error("无法解析 Windows 应用数据目录");
  return {
    source: join(roaming, "GalaxyWK", "Zhixu", "Zhixu", "zhixu.sqlite"),
    target: join(local, "Zhixu", "Data", "zhixu.sqlite"),
    backups: join(local, "Zhixu", "MigrationBackups"),
  };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function timestampForPath(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
}

function tableExists(db: Database.Database, table: string): boolean {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function columnExists(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  if (!tableExists(db, table)) return false;
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).some((item) => item.name === column);
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (!columnExists(db, table, column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function tableCounts(db: Database.Database): Record<string, number> {
  return Object.fromEntries(
    preservedTables
      .filter((table) => tableExists(db, table))
      .map((table) => [
        table,
        Number(
          (
            db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
              count: number;
            }
          ).count,
        ),
      ]),
  );
}

function primaryKeys(db: Database.Database, table: string): string[] {
  if (!tableExists(db, table)) return [];
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
    pk: number;
  }>;
  const key = columns.find((column) => column.pk > 0)?.name;
  if (!key) return [];
  return (
    db
      .prepare(`SELECT ${key} AS value FROM ${table} ORDER BY ${key}`)
      .all() as Array<{ value: unknown }>
  ).map((row) => String(row.value));
}

function snapshot(
  db: Database.Database,
): Map<string, { count: number; keys: string[] }> {
  const result = new Map<string, { count: number; keys: string[] }>();
  for (const table of preservedTables) {
    if (!tableExists(db, table)) continue;
    result.set(table, {
      count: Number(
        (
          db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
            count: number;
          }
        ).count,
      ),
      keys: primaryKeys(db, table),
    });
  }
  return result;
}

function verifySnapshot(
  before: Map<string, { count: number; keys: string[] }>,
  db: Database.Database,
): void {
  for (const [table, expected] of before) {
    const actual = {
      count: Number(
        (
          db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
            count: number;
          }
        ).count,
      ),
      keys: primaryKeys(db, table),
    };
    if (
      actual.count !== expected.count ||
      JSON.stringify(actual.keys) !== JSON.stringify(expected.keys)
    ) {
      throw new Error(`迁移校验失败：${table} 的记录数量或主键集合发生变化`);
    }
  }
}

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description_md TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority INTEGER NOT NULL DEFAULT 1,
      due_at INTEGER,
      estimated_minutes INTEGER NOT NULL DEFAULT 0,
      category_id TEXT,
      repeat_rule TEXT,
      parent_task_id TEXT,
      external_source TEXT,
      external_key TEXT,
      created_by_import_batch_id TEXT,
      completed_at INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS task_categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      color_hex TEXT NOT NULL DEFAULT '#175CD3',
      source TEXT NOT NULL DEFAULT 'tomatodo',
      last_seen_at INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS task_items (
      id TEXT PRIMARY KEY NOT NULL,
      task_id TEXT NOT NULL,
      label TEXT NOT NULL,
      is_done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedule_blocks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      task_id TEXT,
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL,
      is_all_day INTEGER NOT NULL DEFAULT 0,
      repeat_rule TEXT,
      color_hex TEXT NOT NULL DEFAULT '#2563EB',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color_hex TEXT NOT NULL DEFAULT '#8B5CF6',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      content_md TEXT NOT NULL DEFAULT '',
      notebook_id TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content_md TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'edit'
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL DEFAULT '',
      color_hex TEXT NOT NULL DEFAULT '#38BDF8',
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tag_links (
      id TEXT PRIMARY KEY NOT NULL,
      tag_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      trigger_at INTEGER NOT NULL,
      repeat_rule TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      fired_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      source_key TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'tomatodo',
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL,
      task_name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      reflection TEXT,
      status TEXT NOT NULL,
      completion_percent INTEGER NOT NULL DEFAULT 0,
      linked_task_id TEXT,
      import_batch_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS life_events (
      id TEXT PRIMARY KEY NOT NULL,
      source_key TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'tomatodo',
      kind TEXT NOT NULL DEFAULT 'other',
      title TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      note TEXT,
      import_batch_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS countdowns (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      target_date TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      device_id TEXT NOT NULL,
      server_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      export_user TEXT,
      range_start INTEGER,
      range_end INTEGER,
      declared_minutes INTEGER,
      declared_records INTEGER,
      imported_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      rolled_back_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS import_batch_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      operation_id TEXT,
      base_revision INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS sync_cursors (
      entity_type TEXT PRIMARY KEY NOT NULL,
      cursor INTEGER,
      cursor_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sync_account_binding (
      singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1),
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'initializing',
      snapshot_revision INTEGER NOT NULL DEFAULT 0,
      bound_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_synced_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS migration_runs (
      id TEXT PRIMARY KEY NOT NULL,
      source_path TEXT,
      source_hash TEXT,
      source_version INTEGER NOT NULL,
      target_version INTEGER NOT NULL,
      entity_counts_json TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS note_conflicts (
      id TEXT PRIMARY KEY NOT NULL,
      note_id TEXT NOT NULL,
      local_title TEXT NOT NULL,
      local_content_md TEXT NOT NULL,
      remote_title TEXT NOT NULL,
      remote_content_md TEXT NOT NULL,
      base_revision INTEGER NOT NULL,
      remote_revision INTEGER NOT NULL,
      operation_id TEXT,
      server_conflict_id TEXT,
      local_is_pinned INTEGER NOT NULL DEFAULT 0,
      remote_is_pinned INTEGER NOT NULL DEFAULT 0,
      local_updated_at INTEGER,
      remote_updated_at INTEGER,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(id UNINDEXED, entity_type UNINDEXED, title, body);
  `);
}

function migrateToV8(db: Database.Database, fromVersion: number): void {
  if (fromVersion > SCHEMA_VERSION)
    throw new Error(`数据库版本 ${fromVersion} 高于客户端支持版本`);
  const run = db.transaction(() => {
    createSchema(db);
    ensureColumn(db, "tasks", "external_source", "TEXT");
    ensureColumn(db, "tasks", "external_key", "TEXT");
    ensureColumn(db, "tasks", "created_by_import_batch_id", "TEXT");
    ensureColumn(db, "tasks", "category_id", "TEXT");
    ensureColumn(db, "tasks", "server_revision", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "tags", "normalized_name", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "tags", "is_archived", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "tags", "server_revision", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "tag_links", "created_at", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "tag_links", "updated_at", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "tag_links", "deleted_at", "INTEGER");
    ensureColumn(
      db,
      "tag_links",
      "device_id",
      "TEXT NOT NULL DEFAULT 'legacy'",
    );
    ensureColumn(
      db,
      "tag_links",
      "server_revision",
      "INTEGER NOT NULL DEFAULT 0",
    );
    for (const table of [
      "task_categories",
      "schedule_blocks",
      "notes",
      "focus_sessions",
      "life_events",
    ]) {
      ensureColumn(db, table, "server_revision", "INTEGER NOT NULL DEFAULT 0");
    }
    ensureColumn(db, "sync_outbox", "operation_id", "TEXT");
    ensureColumn(
      db,
      "sync_outbox",
      "base_revision",
      "INTEGER NOT NULL DEFAULT 0",
    );
    ensureColumn(
      db,
      "sync_outbox",
      "status",
      "TEXT NOT NULL DEFAULT 'pending'",
    );
    ensureColumn(
      db,
      "sync_cursors",
      "cursor_revision",
      "INTEGER NOT NULL DEFAULT 0",
    );
    ensureColumn(db, "note_conflicts", "operation_id", "TEXT");
    ensureColumn(db, "note_conflicts", "server_conflict_id", "TEXT");
    ensureColumn(
      db,
      "note_conflicts",
      "local_is_pinned",
      "INTEGER NOT NULL DEFAULT 0",
    );
    ensureColumn(
      db,
      "note_conflicts",
      "remote_is_pinned",
      "INTEGER NOT NULL DEFAULT 0",
    );
    ensureColumn(db, "note_conflicts", "local_updated_at", "INTEGER");
    ensureColumn(db, "note_conflicts", "remote_updated_at", "INTEGER");
    db.exec(`
      UPDATE tags SET normalized_name = lower(trim(name)) WHERE normalized_name = '';
      DELETE FROM sync_outbox
      WHERE id NOT IN (SELECT MAX(id) FROM sync_outbox GROUP BY entity_type, entity_id);
      UPDATE sync_outbox
      SET operation_id = COALESCE(operation_id, 'legacy-' || id),
          base_revision = COALESCE(base_revision, 0),
          status = COALESCE(status, 'pending');
      CREATE UNIQUE INDEX IF NOT EXISTS sync_outbox_entity_idx
        ON sync_outbox(entity_type, entity_id);
      CREATE UNIQUE INDEX IF NOT EXISTS note_conflicts_operation_idx
        ON note_conflicts(operation_id) WHERE operation_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS task_categories_active_name_idx
        ON task_categories(source, normalized_name) WHERE deleted_at IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS tags_active_name_idx
        ON tags(normalized_name) WHERE deleted_at IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS tag_links_active_entity_idx
        ON tag_links(tag_id, entity_type, entity_id) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(due_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS focus_start_idx ON focus_sessions(start_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS life_events_time_idx ON life_events(occurred_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS countdowns_target_idx ON countdowns(target_date) WHERE deleted_at IS NULL;
      PRAGMA user_version = 8;
    `);
  });
  run();
}

export function initializeDatabase(
  paths = defaultDatabasePaths(),
): DatabaseContext {
  mkdirSync(dirname(paths.target), { recursive: true });
  mkdirSync(paths.backups, { recursive: true });
  const sourceExists = existsSync(paths.source);
  const targetExists = existsSync(paths.target);
  let sourceHash: string | null = null;
  let backupPath: string | null = null;
  let status: MigrationReport["status"] = targetExists
    ? "current"
    : sourceExists
      ? "migrated"
      : "fresh";

  if (!targetExists && sourceExists) {
    sourceHash = sha256File(paths.source);
    const backupDirectory = join(paths.backups, timestampForPath());
    mkdirSync(backupDirectory, { recursive: true });
    backupPath = join(
      backupDirectory,
      `zhixu-v5-${sourceHash.slice(0, 12)}.sqlite`,
    );
    copyFileSync(paths.source, backupPath);
    copyFileSync(paths.source, paths.target);
    if (
      sha256File(paths.target) !== sourceHash ||
      sha256File(backupPath) !== sourceHash
    ) {
      throw new Error("旧数据库副本的 SHA-256 校验失败");
    }
  }

  const db = new Database(paths.target);
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    const fromVersion = Number(db.pragma("user_version", { simple: true }));
    const before = snapshot(db);
    migrateToV8(db, fromVersion);
    verifySnapshot(before, db);
    const integrity = String(db.pragma("integrity_check", { simple: true }));
    if (integrity !== "ok")
      throw new Error(`SQLite 完整性检查失败：${integrity}`);
    const counts = tableCounts(db);
    db.prepare(
      `INSERT INTO migration_runs
       (id, source_path, source_hash, source_version, target_version, entity_counts_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'success', ?)`,
    ).run(
      randomUUID(),
      sourceExists ? paths.source : null,
      sourceHash,
      fromVersion,
      SCHEMA_VERSION,
      JSON.stringify(counts),
      Math.floor(Date.now() / 1000),
    );
    return {
      db,
      paths,
      report: {
        status,
        sourcePath: sourceExists ? paths.source : null,
        sourceHash,
        backupPath,
        fromVersion,
        toVersion: SCHEMA_VERSION,
        integrity,
        entityCounts: counts,
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
