import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { SyncOperation } from "@zhixu/contracts";
import type {
  NoteConflictRecord,
  NoteConflictResolution,
} from "../../preload/api-types";

type SqlRow = Record<string, unknown>;

const entityTables = {
  task_category: "task_categories",
  tag: "tags",
  task: "tasks",
  tag_link: "tag_links",
  note: "notes",
  schedule_block: "schedule_blocks",
  focus_session: "focus_sessions",
  life_event: "life_events",
  countdown: "countdowns",
} as const;

export type SyncEntityType = keyof typeof entityTables;

export const syncEntityOrder = Object.keys(entityTables) as SyncEntityType[];

const booleanColumns = new Set(["is_archived", "is_pinned", "is_all_day"]);

export interface PendingOperation extends SyncOperation {
  rowId: number;
}

export interface SyncBinding {
  userId: string;
  email: string;
  state: "initializing" | "bound";
  snapshotRevision: number;
  lastSyncedAt: string | null;
}

export interface RemoteChange {
  revision: number;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: "upsert" | "delete";
  payload: SqlRow;
}

export interface RemoteSnapshot {
  revision: number;
  entities: Partial<Record<SyncEntityType, SqlRow[]>>;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function toIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toEpoch(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function timestamp(value: unknown): number {
  return toEpoch(value) ?? 0;
}

function bindable(value: unknown): string | number | bigint | Buffer | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    Buffer.isBuffer(value)
  )
    return value;
  return JSON.stringify(value);
}

function asConflict(row: SqlRow): NoteConflictRecord {
  return {
    id: String(row.id),
    noteId: String(row.note_id),
    localTitle: String(row.local_title),
    localContentMd: String(row.local_content_md ?? ""),
    localUpdatedAt: toIso(row.local_updated_at),
    remoteTitle: String(row.remote_title),
    remoteContentMd: String(row.remote_content_md ?? ""),
    remoteUpdatedAt: toIso(row.remote_updated_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

export class SyncRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deviceId: string,
  ) {}

  getBinding(): SyncBinding | null {
    const row = this.db
      .prepare("SELECT * FROM sync_account_binding WHERE singleton = 1")
      .get() as SqlRow | undefined;
    if (!row) return null;
    return {
      userId: String(row.user_id),
      email: String(row.email),
      state: String(row.state) as SyncBinding["state"],
      snapshotRevision: Number(row.snapshot_revision ?? 0),
      lastSyncedAt: toIso(row.last_synced_at),
    };
  }

  beginBinding(userId: string, email: string): void {
    const now = nowSeconds();
    this.db
      .prepare(
        `INSERT INTO sync_account_binding
         (singleton, user_id, email, state, snapshot_revision, bound_at, updated_at)
         VALUES (1, ?, ?, 'initializing', 0, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`,
      )
      .run(userId, email, now, now);
  }

  completeBinding(revision: number): void {
    const now = nowSeconds();
    this.db
      .prepare(
        `UPDATE sync_account_binding
         SET state = 'bound', snapshot_revision = ?, last_synced_at = ?, updated_at = ?
         WHERE singleton = 1`,
      )
      .run(revision, now, now);
    this.setCursor(revision);
  }

  markSynced(revision: number): void {
    const now = nowSeconds();
    this.setCursor(revision);
    this.db
      .prepare(
        `UPDATE sync_account_binding
         SET snapshot_revision = MAX(snapshot_revision, ?), last_synced_at = ?, updated_at = ?
         WHERE singleton = 1`,
      )
      .run(revision, now, now);
  }

  cursor(): number {
    const row = this.db
      .prepare(
        "SELECT cursor_revision FROM sync_cursors WHERE entity_type = '__global__'",
      )
      .get() as SqlRow | undefined;
    return Number(row?.cursor_revision ?? 0);
  }

  private setCursor(revision: number): void {
    this.db
      .prepare(
        `INSERT INTO sync_cursors(entity_type, cursor, cursor_revision)
         VALUES ('__global__', ?, ?)
         ON CONFLICT(entity_type) DO UPDATE SET cursor = excluded.cursor,
           cursor_revision = MAX(sync_cursors.cursor_revision, excluded.cursor_revision)`,
      )
      .run(revision, revision);
  }

  pendingCount(): number {
    return Number(
      (
        this.db
          .prepare("SELECT COUNT(*) AS count FROM sync_outbox")
          .get() as SqlRow
      ).count,
    );
  }

  conflictCount(): number {
    return Number(
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM note_conflicts WHERE resolved_at IS NULL",
          )
          .get() as SqlRow
      ).count,
    );
  }

  listPending(limit = 100): PendingOperation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM sync_outbox
         WHERE status <> 'blocked' ORDER BY created_at, id LIMIT ?`,
      )
      .all(limit) as SqlRow[];
    return rows.map((row) => ({
      rowId: Number(row.id),
      operationId: String(row.operation_id),
      entityType: String(row.entity_type) as SyncEntityType,
      entityId: String(row.entity_id),
      operation: String(row.operation) as "upsert" | "delete",
      baseRevision: Number(row.base_revision ?? 0),
      payload: this.toRemotePayload(
        JSON.parse(String(row.payload_json)) as SqlRow,
      ),
    }));
  }

  acknowledge(operation: PendingOperation, revision: number): void {
    const table = entityTables[operation.entityType as SyncEntityType];
    const run = this.db.transaction(() => {
      if (table)
        this.db
          .prepare(`UPDATE ${table} SET server_revision = ? WHERE id = ?`)
          .run(revision, operation.entityId);
      const deleted = this.db
        .prepare("DELETE FROM sync_outbox WHERE operation_id = ?")
        .run(operation.operationId);
      if (deleted.changes === 0)
        this.db
          .prepare(
            `UPDATE sync_outbox SET base_revision = ?, status = 'pending'
             WHERE entity_type = ? AND entity_id = ?`,
          )
          .run(revision, operation.entityType, operation.entityId);
    });
    run();
  }

  markFailed(operationId: string, error: string): void {
    this.db
      .prepare(
        `UPDATE sync_outbox SET retry_count = retry_count + 1,
         last_error = ?, status = 'pending' WHERE operation_id = ?`,
      )
      .run(error.slice(0, 1000), operationId);
  }

  mergeInitialSnapshot(snapshot: RemoteSnapshot): void {
    const run = this.db.transaction(() => {
      for (const entityType of syncEntityOrder) {
        const table = entityTables[entityType];
        const remoteRows = snapshot.entities[entityType] ?? [];
        const matched = new Set<string>();
        for (const remoteRaw of remoteRows) {
          const remote = this.toLocalPayload(remoteRaw);
          const remoteId = String(remote.id);
          let local = this.findMatchingLocal(entityType, remote);
          if (local && String(local.id) !== remoteId)
            local = this.adoptRemoteId(entityType, local, remoteId);
          if (!local) {
            this.upsertLocal(table, remote);
            matched.add(remoteId);
            continue;
          }
          matched.add(remoteId);
          if (entityType === "note" && this.notesDiffer(local, remote)) {
            this.recordConflict(local, remote, null, null);
            this.db
              .prepare(
                "DELETE FROM sync_outbox WHERE entity_type = 'note' AND entity_id = ?",
              )
              .run(remoteId);
            continue;
          }
          if (timestamp(remote.updated_at) >= timestamp(local.updated_at))
            this.upsertLocal(table, remote);
          else this.enqueue(entityType, remoteId, local);
        }
        const locals = this.db
          .prepare(`SELECT * FROM ${table}`)
          .all() as SqlRow[];
        for (const local of locals) {
          const id = String(local.id);
          if (!matched.has(id)) this.enqueue(entityType, id, local);
        }
      }
      this.setCursor(snapshot.revision);
    });
    run();
  }

  applyChanges(changes: RemoteChange[]): number {
    let latest = this.cursor();
    const run = this.db.transaction(() => {
      for (const change of changes) {
        latest = Math.max(latest, Number(change.revision));
        const table = entityTables[change.entity_type];
        if (!table) continue;
        const remote = this.toLocalPayload({
          ...change.payload,
          id: change.entity_id,
          server_revision: change.revision,
        });
        const local = this.db
          .prepare(`SELECT * FROM ${table} WHERE id = ?`)
          .get(change.entity_id) as SqlRow | undefined;
        const pending = this.db
          .prepare(
            "SELECT * FROM sync_outbox WHERE entity_type = ? AND entity_id = ?",
          )
          .get(change.entity_type, change.entity_id) as SqlRow | undefined;
        if (
          change.entity_type === "note" &&
          local &&
          pending &&
          Number(change.revision) > Number(pending.base_revision ?? 0) &&
          this.notesDiffer(local, remote)
        ) {
          this.recordConflict(
            local,
            remote,
            String(pending.operation_id),
            null,
          );
          this.db
            .prepare("UPDATE sync_outbox SET status = 'blocked' WHERE id = ?")
            .run(pending.id);
          continue;
        }
        if (
          !local ||
          timestamp(remote.updated_at) >= timestamp(local.updated_at)
        ) {
          this.upsertLocal(table, remote);
          if (pending)
            this.db
              .prepare("DELETE FROM sync_outbox WHERE operation_id = ?")
              .run(pending.operation_id);
        }
      }
      this.setCursor(latest);
    });
    run();
    return latest;
  }

  recordServerConflict(
    operation: PendingOperation,
    conflict: {
      id: string;
      remoteRevision: number;
      remotePayload: SqlRow;
    },
  ): void {
    const local = this.db
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(operation.entityId) as SqlRow | undefined;
    if (!local) return;
    this.recordConflict(
      local,
      this.toLocalPayload({
        ...conflict.remotePayload,
        id: operation.entityId,
        server_revision: conflict.remoteRevision,
      }),
      operation.operationId,
      conflict.id,
    );
    this.db
      .prepare(
        "UPDATE sync_outbox SET status = 'blocked' WHERE operation_id = ?",
      )
      .run(operation.operationId);
  }

  listConflicts(): NoteConflictRecord[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM note_conflicts WHERE resolved_at IS NULL ORDER BY created_at DESC",
        )
        .all() as SqlRow[]
    ).map(asConflict);
  }

  serverConflictId(id: string): string | null {
    const row = this.db
      .prepare(
        "SELECT server_conflict_id FROM note_conflicts WHERE id = ? AND resolved_at IS NULL",
      )
      .get(id) as SqlRow | undefined;
    return row?.server_conflict_id == null
      ? null
      : String(row.server_conflict_id);
  }

  resolveConflict(
    id: string,
    resolution: NoteConflictResolution,
  ): { serverConflictId: string | null } {
    const conflict = this.db
      .prepare(
        "SELECT * FROM note_conflicts WHERE id = ? AND resolved_at IS NULL",
      )
      .get(id) as SqlRow | undefined;
    if (!conflict) throw new Error("笔记冲突不存在或已处理");
    const now = nowSeconds();
    const noteId = String(conflict.note_id);
    const run = this.db.transaction(() => {
      this.archiveConflictVersion(
        noteId,
        String(conflict.local_title),
        String(conflict.local_content_md),
        "sync-conflict-local",
      );
      this.archiveConflictVersion(
        noteId,
        String(conflict.remote_title),
        String(conflict.remote_content_md),
        "sync-conflict-remote",
      );
      if (resolution === "remote" || resolution === "both") {
        this.db
          .prepare(
            `UPDATE notes SET title = ?, content_md = ?, is_pinned = ?, updated_at = ?,
             deleted_at = NULL, server_revision = ? WHERE id = ?`,
          )
          .run(
            conflict.remote_title,
            conflict.remote_content_md,
            conflict.remote_is_pinned,
            conflict.remote_updated_at ?? now,
            conflict.remote_revision,
            noteId,
          );
        this.db
          .prepare(
            "DELETE FROM sync_outbox WHERE entity_type = 'note' AND entity_id = ?",
          )
          .run(noteId);
      }
      if (resolution === "local") {
        const local = this.db
          .prepare("SELECT * FROM notes WHERE id = ?")
          .get(noteId) as SqlRow;
        this.enqueue("note", noteId, {
          ...local,
          server_revision: conflict.remote_revision,
        });
      }
      if (resolution === "both") {
        const duplicateId = randomUUID();
        const duplicate = {
          id: duplicateId,
          title: `${String(conflict.local_title)}（本地冲突副本）`,
          content_md: conflict.local_content_md,
          notebook_id: null,
          is_pinned: conflict.local_is_pinned,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          device_id: this.deviceId,
          server_revision: 0,
        };
        this.upsertLocal("notes", duplicate);
        this.enqueue("note", duplicateId, duplicate);
      }
      this.db
        .prepare("UPDATE note_conflicts SET resolved_at = ? WHERE id = ?")
        .run(now, id);
    });
    run();
    return {
      serverConflictId:
        conflict.server_conflict_id == null
          ? null
          : String(conflict.server_conflict_id),
    };
  }

  private archiveConflictVersion(
    noteId: string,
    title: string,
    content: string,
    source: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO note_versions(id, note_id, title, content_md, created_at, source)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), noteId, title, content, nowSeconds(), source);
  }

  private recordConflict(
    local: SqlRow,
    remote: SqlRow,
    operationId: string | null,
    serverConflictId: string | null,
  ): void {
    const id = serverConflictId ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO note_conflicts
         (id, note_id, local_title, local_content_md, remote_title,
          remote_content_md, base_revision, remote_revision, operation_id,
          server_conflict_id, local_is_pinned, remote_is_pinned,
          local_updated_at, remote_updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET remote_title = excluded.remote_title,
           remote_content_md = excluded.remote_content_md,
           remote_revision = excluded.remote_revision,
           remote_updated_at = excluded.remote_updated_at`,
      )
      .run(
        id,
        String(local.id),
        String(local.title),
        String(local.content_md ?? ""),
        String(remote.title),
        String(remote.content_md ?? ""),
        Number(local.server_revision ?? 0),
        Number(remote.server_revision ?? 0),
        operationId,
        serverConflictId,
        Number(local.is_pinned ?? 0),
        Number(remote.is_pinned ?? 0),
        timestamp(local.updated_at),
        timestamp(remote.updated_at),
        nowSeconds(),
      );
  }

  private notesDiffer(local: SqlRow, remote: SqlRow): boolean {
    return (
      String(local.title) !== String(remote.title) ||
      String(local.content_md ?? "") !== String(remote.content_md ?? "") ||
      Number(local.is_pinned ?? 0) !== Number(remote.is_pinned ?? 0)
    );
  }

  private findMatchingLocal(
    entityType: SyncEntityType,
    remote: SqlRow,
  ): SqlRow | undefined {
    const table = entityTables[entityType];
    const byId = this.db
      .prepare(`SELECT * FROM ${table} WHERE id = ?`)
      .get(remote.id) as SqlRow | undefined;
    if (byId) return byId;
    if (entityType === "task_category")
      return this.db
        .prepare(
          "SELECT * FROM task_categories WHERE source = ? AND normalized_name = ?",
        )
        .get(remote.source, remote.normalized_name) as SqlRow | undefined;
    if (entityType === "tag")
      return this.db
        .prepare("SELECT * FROM tags WHERE normalized_name = ?")
        .get(remote.normalized_name) as SqlRow | undefined;
    if (entityType === "focus_session" || entityType === "life_event")
      return this.db
        .prepare(`SELECT * FROM ${table} WHERE source_key = ?`)
        .get(remote.source_key) as SqlRow | undefined;
    if (entityType === "tag_link")
      return this.db
        .prepare(
          `SELECT * FROM tag_links
           WHERE tag_id = ? AND entity_type = ? AND entity_id = ?`,
        )
        .get(remote.tag_id, remote.entity_type, remote.entity_id) as
        SqlRow | undefined;
    return undefined;
  }

  private adoptRemoteId(
    entityType: SyncEntityType,
    local: SqlRow,
    remoteId: string,
  ): SqlRow {
    const table = entityTables[entityType];
    const oldId = String(local.id);
    if (entityType === "task_category")
      this.db
        .prepare("UPDATE tasks SET category_id = ? WHERE category_id = ?")
        .run(remoteId, oldId);
    if (entityType === "tag")
      this.db
        .prepare("UPDATE tag_links SET tag_id = ? WHERE tag_id = ?")
        .run(remoteId, oldId);
    this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(oldId);
    const adopted = { ...local, id: remoteId };
    this.upsertLocal(table, adopted);
    this.db
      .prepare(
        "DELETE FROM sync_outbox WHERE entity_type = ? AND entity_id = ?",
      )
      .run(entityType, oldId);
    return adopted;
  }

  private enqueue(
    entityType: SyncEntityType,
    entityId: string,
    payload: SqlRow,
  ): void {
    const operation = payload.deleted_at == null ? "upsert" : "delete";
    const normalized = { ...payload, device_id: this.deviceId };
    this.db
      .prepare(
        `INSERT INTO sync_outbox
         (entity_type, entity_id, operation, payload_json, created_at, retry_count,
          last_error, operation_id, base_revision, status)
         VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, 'pending')
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           operation = excluded.operation, payload_json = excluded.payload_json,
           created_at = excluded.created_at, retry_count = 0, last_error = NULL,
           operation_id = excluded.operation_id,
           base_revision = MAX(sync_outbox.base_revision, excluded.base_revision),
           status = 'pending'`,
      )
      .run(
        entityType,
        entityId,
        operation,
        JSON.stringify(normalized),
        nowSeconds(),
        randomUUID(),
        Number(payload.server_revision ?? 0),
      );
  }

  private upsertLocal(table: string, row: SqlRow): void {
    const allowed = new Set(
      (
        this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string;
        }>
      ).map((column) => column.name),
    );
    const entries = Object.entries(row).filter(([key]) => allowed.has(key));
    if (!entries.length) return;
    const columns = entries.map(([key]) => `"${key}"`).join(", ");
    const placeholders = entries.map(() => "?").join(", ");
    const updates = entries
      .filter(([key]) => key !== "id")
      .map(([key]) => `"${key}" = excluded."${key}"`)
      .join(", ");
    this.db
      .prepare(
        `INSERT INTO ${table} (${columns}) VALUES (${placeholders})
         ON CONFLICT(id) DO UPDATE SET ${updates}`,
      )
      .run(...entries.map(([, value]) => bindable(value)));
  }

  private toRemotePayload(row: SqlRow): SqlRow {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (key.endsWith("_at") && value != null) return [key, toIso(value)];
        if (booleanColumns.has(key)) return [key, Boolean(Number(value))];
        return [key, value];
      }),
    );
  }

  private toLocalPayload(row: SqlRow): SqlRow {
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key !== "user_id")
        .map(([key, value]) => {
          if (key.endsWith("_at") && value != null)
            return [key, toEpoch(value)];
          if (booleanColumns.has(key)) return [key, value ? 1 : 0];
          return [key, value];
        }),
    );
  }
}
