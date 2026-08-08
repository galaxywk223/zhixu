import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/data/repository.dart';

void main() {
  test('schema v2 升级到 v5 保留任务并生成番茄分类', () async {
    final database = ZhixuDatabase(
      NativeDatabase.memory(
        setup: (raw) {
          raw.execute('PRAGMA user_version = 2');
          raw.execute('''
            CREATE TABLE tasks (
              id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL,
              description_md TEXT, status TEXT NOT NULL DEFAULT 'todo',
              priority INTEGER NOT NULL DEFAULT 1, due_at INTEGER,
              estimated_minutes INTEGER NOT NULL DEFAULT 0, repeat_rule TEXT,
              project_id TEXT, parent_task_id TEXT, external_source TEXT,
              external_key TEXT, created_by_import_batch_id TEXT, completed_at INTEGER,
              is_archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL,
              server_revision INTEGER NOT NULL DEFAULT 0
            )
          ''');
          raw.execute('''
            CREATE TABLE projects (
              id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'project',
              description_md TEXT, start_date INTEGER, target_date INTEGER,
              color_hex TEXT NOT NULL DEFAULT '#3B82F6', is_archived INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
              device_id TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0
            )
          ''');
          raw.execute('''
            CREATE TABLE schedule_blocks (
              id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, task_id TEXT,
              project_id TEXT, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
              is_all_day INTEGER NOT NULL DEFAULT 0, repeat_rule TEXT,
              color_hex TEXT NOT NULL DEFAULT '#2563EB', created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL, deleted_at INTEGER, device_id TEXT NOT NULL,
              server_revision INTEGER NOT NULL DEFAULT 0
            )
          ''');
          raw.execute('''
            CREATE TABLE notes (
              id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, content_md TEXT NOT NULL DEFAULT '',
              notebook_id TEXT, project_id TEXT, is_pinned INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
              device_id TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0
            )
          ''');
          raw.execute('''
            CREATE TABLE focus_sessions (
              id TEXT PRIMARY KEY NOT NULL, source_key TEXT NOT NULL UNIQUE,
              source TEXT NOT NULL DEFAULT 'tomatodo', start_at INTEGER NOT NULL,
              end_at INTEGER NOT NULL, task_name TEXT NOT NULL, duration_minutes INTEGER NOT NULL,
              reflection TEXT, status TEXT NOT NULL, completion_percent INTEGER NOT NULL DEFAULT 0,
              linked_task_id TEXT, linked_project_id TEXT, import_batch_id TEXT,
              created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
              device_id TEXT NOT NULL, server_revision INTEGER NOT NULL DEFAULT 0
            )
          ''');
          raw.execute('''
            CREATE TABLE life_events (
              id TEXT PRIMARY KEY NOT NULL, source_key TEXT NOT NULL UNIQUE,
              source TEXT NOT NULL DEFAULT 'tomatodo', kind TEXT NOT NULL DEFAULT 'other',
              title TEXT NOT NULL, occurred_at INTEGER NOT NULL, note TEXT,
              import_batch_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
              deleted_at INTEGER, device_id TEXT NOT NULL,
              server_revision INTEGER NOT NULL DEFAULT 0
            )
          ''');
          raw.execute('''
            CREATE TABLE tags (
              id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
              color_hex TEXT NOT NULL DEFAULT '#38BDF8',
              created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
              deleted_at INTEGER, device_id TEXT NOT NULL
            )
          ''');
          raw.execute('''
            CREATE TABLE tag_links (
              id TEXT PRIMARY KEY NOT NULL, tag_id TEXT NOT NULL,
              entity_type TEXT NOT NULL, entity_id TEXT NOT NULL
            )
          ''');
          raw.execute('''
            CREATE TABLE import_batches (
              id TEXT PRIMARY KEY NOT NULL, source TEXT NOT NULL, file_name TEXT NOT NULL,
              file_hash TEXT NOT NULL, export_user TEXT, range_start INTEGER, range_end INTEGER,
              declared_minutes INTEGER, declared_records INTEGER, imported_count INTEGER NOT NULL DEFAULT 0,
              skipped_count INTEGER NOT NULL DEFAULT 0, error_message TEXT, created_at INTEGER NOT NULL,
              rolled_back_at INTEGER
            )
          ''');
          raw.execute(
            'CREATE VIRTUAL TABLE search_index USING fts5(id UNINDEXED, entity_type UNINDEXED, title, body)',
          );
          raw.execute('''
            CREATE TABLE import_batch_changes (
              id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL,
              entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
              operation TEXT NOT NULL, before_json TEXT, after_json TEXT,
              created_at INTEGER NOT NULL
            )
          ''');
          raw.execute('''
            CREATE TABLE sync_outbox (
              id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL,
              entity_id TEXT NOT NULL, operation TEXT NOT NULL, payload_json TEXT NOT NULL,
              created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0,
              last_error TEXT
            )
          ''');
          raw.execute('''
            CREATE TABLE sync_cursors (
              entity_type TEXT PRIMARY KEY NOT NULL, cursor INTEGER
            )
          ''');
          final focusStart = DateTime.utc(
            2026,
            8,
            7,
            12,
            49,
          ).millisecondsSinceEpoch;
          final focusEnd = DateTime.utc(
            2026,
            8,
            7,
            13,
            2,
          ).millisecondsSinceEpoch;
          raw.execute(
            "INSERT INTO focus_sessions (id, source_key, start_at, end_at, task_name, duration_minutes, status, created_at, updated_at, device_id) VALUES ('focus', 'old', ?, ?, 'vibe coding', 13, '貌]艗[\u0010b', ?, ?, 'old')",
            [focusStart, focusEnd, focusStart, focusStart],
          );
          raw.execute(
            "INSERT INTO tasks (id, title, external_source, created_at, updated_at, device_id) VALUES ('auto-task', 'vibe coding', 'tomatodo', ?, ?, 'old')",
            [focusStart, focusStart],
          );
          raw.execute(
            "INSERT INTO tasks (id, title, created_at, updated_at, device_id) VALUES ('manual-task', '人工任务', ?, ?, 'old')",
            [focusStart, focusStart],
          );
          raw.execute(
            "UPDATE focus_sessions SET linked_task_id = 'auto-task' WHERE id = 'focus'",
          );
          raw.execute(
            "INSERT INTO focus_sessions (id, source_key, start_at, end_at, task_name, duration_minutes, status, created_at, updated_at, device_id) VALUES ('wake', 'old-wake', ?, ?, 'w聧艩^', 0, '貌]艗[\u0010b', ?, ?, 'old')",
            [focusStart, focusStart, focusStart, focusStart],
          );
        },
      ),
    );
    final repository = ZhixuRepository(database, deviceId: 'migration-test');
    await repository.reconcileLegacyTomatoData();
    expect(await repository.focusMinutes(), 13);
    expect((await repository.watchTasks().first).single.title, '人工任务');
    final migratedFocus = await repository.watchFocusSessions().first;
    expect(migratedFocus.single.linkedTaskId, isNull);
    final autoTask = await (database.select(
      database.tasks,
    )..where((row) => row.id.equals('auto-task'))).getSingle();
    expect(autoTask.isArchived, isTrue);
    expect(autoTask.deletedAt, isNotNull);
    expect((await repository.watchLifeEvents().first).single.title, '起床');
    final categories = await repository.watchTaskCategories().first;
    expect(categories, hasLength(1));
    expect(categories.single.name, 'vibe coding');
    expect(categories.single.isArchived, isFalse);
    final projectTable = await database
        .customSelect(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'",
        )
        .get();
    expect(projectTable, isEmpty);
    for (final table in const ['tasks', 'schedule_blocks', 'notes']) {
      final columns = await database
          .customSelect('PRAGMA table_info($table)')
          .get();
      expect(
        columns.map((row) => row.read<String>('name')),
        isNot(contains('project_id')),
      );
    }
    final taskColumns = await database
        .customSelect('PRAGMA table_info(tasks)')
        .get();
    expect(
      taskColumns.map((row) => row.read<String>('name')),
      contains('category_id'),
    );
    final tagColumns = await database
        .customSelect('PRAGMA table_info(tags)')
        .get();
    expect(
      tagColumns.map((row) => row.read<String>('name')),
      containsAll(['normalized_name', 'is_archived', 'server_revision']),
    );
    await database.close();
  });
}
