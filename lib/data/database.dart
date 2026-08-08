import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

part 'database.g.dart';

const _uuid = Uuid();

class Tasks extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get descriptionMd => text().nullable()();
  TextColumn get status => text().withDefault(const Constant('todo'))();
  IntColumn get priority => integer().withDefault(const Constant(1))();
  DateTimeColumn get dueAt => dateTime().nullable()();
  IntColumn get estimatedMinutes => integer().withDefault(const Constant(0))();
  TextColumn get repeatRule => text().nullable()();
  TextColumn get parentTaskId => text().nullable()();
  TextColumn get externalSource => text().nullable()();
  TextColumn get externalKey => text().nullable()();
  TextColumn get createdByImportBatchId => text().nullable()();
  DateTimeColumn get completedAt => dateTime().nullable()();
  BoolColumn get isArchived => boolean().withDefault(const Constant(false))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();
  IntColumn get serverRevision => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class TaskItems extends Table {
  TextColumn get id => text()();
  TextColumn get taskId => text()();
  TextColumn get label => text()();
  BoolColumn get isDone => boolean().withDefault(const Constant(false))();
  IntColumn get sortOrder => integer().withDefault(const Constant(0))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ScheduleBlocks extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get taskId => text().nullable()();
  DateTimeColumn get startAt => dateTime()();
  DateTimeColumn get endAt => dateTime()();
  BoolColumn get isAllDay => boolean().withDefault(const Constant(false))();
  TextColumn get repeatRule => text().nullable()();
  TextColumn get colorHex => text().withDefault(const Constant('#2563EB'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();
  IntColumn get serverRevision => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Notebooks extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get colorHex => text().withDefault(const Constant('#8B5CF6'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Notes extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get contentMd => text().withDefault(const Constant(''))();
  TextColumn get notebookId => text().nullable()();
  BoolColumn get isPinned => boolean().withDefault(const Constant(false))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();
  IntColumn get serverRevision => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class NoteVersions extends Table {
  TextColumn get id => text()();
  TextColumn get noteId => text()();
  TextColumn get title => text()();
  TextColumn get contentMd => text()();
  DateTimeColumn get createdAt => dateTime()();
  TextColumn get source => text().withDefault(const Constant('edit'))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Tags extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get colorHex => text().withDefault(const Constant('#38BDF8'))();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class TagLinks extends Table {
  TextColumn get id => text()();
  TextColumn get tagId => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class Reminders extends Table {
  TextColumn get id => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  DateTimeColumn get triggerAt => dateTime()();
  TextColumn get repeatRule => text().nullable()();
  BoolColumn get isEnabled => boolean().withDefault(const Constant(true))();
  DateTimeColumn get firedAt => dateTime().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class FocusSessions extends Table {
  TextColumn get id => text()();
  TextColumn get sourceKey => text()();
  TextColumn get source => text().withDefault(const Constant('tomatodo'))();
  DateTimeColumn get startAt => dateTime()();
  DateTimeColumn get endAt => dateTime()();
  TextColumn get taskName => text()();
  IntColumn get durationMinutes => integer()();
  TextColumn get reflection => text().nullable()();
  TextColumn get status => text()();
  IntColumn get completionPercent => integer().withDefault(const Constant(0))();
  TextColumn get linkedTaskId => text().nullable()();
  TextColumn get importBatchId => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();
  IntColumn get serverRevision => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {sourceKey},
  ];
}

class LifeEvents extends Table {
  TextColumn get id => text()();
  TextColumn get sourceKey => text()();
  TextColumn get source => text().withDefault(const Constant('tomatodo'))();
  TextColumn get kind => text().withDefault(const Constant('other'))();
  TextColumn get title => text()();
  DateTimeColumn get occurredAt => dateTime()();
  TextColumn get note => text().nullable()();
  TextColumn get importBatchId => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();
  TextColumn get deviceId => text()();
  IntColumn get serverRevision => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {id};

  @override
  List<Set<Column<Object>>> get uniqueKeys => [
    {sourceKey},
  ];
}

class ImportBatches extends Table {
  TextColumn get id => text()();
  TextColumn get source => text()();
  TextColumn get fileName => text()();
  TextColumn get fileHash => text()();
  TextColumn get exportUser => text().nullable()();
  DateTimeColumn get rangeStart => dateTime().nullable()();
  DateTimeColumn get rangeEnd => dateTime().nullable()();
  IntColumn get declaredMinutes => integer().nullable()();
  IntColumn get declaredRecords => integer().nullable()();
  IntColumn get importedCount => integer().withDefault(const Constant(0))();
  IntColumn get skippedCount => integer().withDefault(const Constant(0))();
  TextColumn get errorMessage => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get rolledBackAt => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ImportBatchChanges extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get batchId => text()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get operation => text()();
  TextColumn get beforeJson => text().nullable()();
  TextColumn get afterJson => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();
}

class SyncOutbox extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get entityType => text()();
  TextColumn get entityId => text()();
  TextColumn get operation => text()();
  TextColumn get payloadJson => text()();
  DateTimeColumn get createdAt => dateTime()();
  IntColumn get retryCount => integer().withDefault(const Constant(0))();
  TextColumn get lastError => text().nullable()();
}

class SyncCursors extends Table {
  TextColumn get entityType => text()();
  DateTimeColumn get cursor => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {entityType};
}

@DriftDatabase(
  tables: [
    Tasks,
    TaskItems,
    ScheduleBlocks,
    Notebooks,
    Notes,
    NoteVersions,
    Tags,
    TagLinks,
    Reminders,
    FocusSessions,
    LifeEvents,
    ImportBatches,
    ImportBatchChanges,
    SyncOutbox,
    SyncCursors,
  ],
)
class ZhixuDatabase extends _$ZhixuDatabase {
  ZhixuDatabase(super.e);

  @override
  int get schemaVersion => 4;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      await m.createAll();
      await customStatement(
        'CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(id UNINDEXED, entity_type UNINDEXED, title, body)',
      );
    },
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.addColumn(tasks, tasks.externalSource);
        await m.addColumn(tasks, tasks.externalKey);
        await m.addColumn(tasks, tasks.createdByImportBatchId);
        await m.createTable(lifeEvents);
        await m.createTable(importBatchChanges);
      }
      if (from < 3) {
        await m.deleteTable('projects');
        await m.dropColumn(tasks, 'project_id');
        await m.dropColumn(scheduleBlocks, 'project_id');
        await m.dropColumn(notes, 'project_id');
        await m.dropColumn(focusSessions, 'linked_project_id');
        await customStatement(
          "DELETE FROM sync_outbox WHERE entity_type = 'project'",
        );
        await customStatement(
          "DELETE FROM sync_cursors WHERE entity_type = 'project'",
        );
      }
      if (from < 4) {
        await customStatement(
          "UPDATE focus_sessions SET linked_task_id = NULL WHERE source = 'tomatodo'",
        );
        await customStatement(
          "UPDATE tasks SET is_archived = 1, deleted_at = COALESCE(deleted_at, updated_at) WHERE external_source = 'tomatodo'",
        );
      }
    },
  );

  static Future<ZhixuDatabase> open() async {
    final dir = await getApplicationSupportDirectory();
    final dbDir = Directory(p.join(dir.path, 'Zhixu'));
    await dbDir.create(recursive: true);
    return ZhixuDatabase(
      NativeDatabase(File(p.join(dbDir.path, 'zhixu.sqlite'))),
    );
  }

  static ZhixuDatabase memory() => ZhixuDatabase(NativeDatabase.memory());

  Future<void> rebuildSearchIndex() async {
    await transaction(() async {
      await customStatement('DELETE FROM search_index');
      final taskRows =
          await (select(tasks)..where(
                (row) =>
                    row.deletedAt.isNull() &
                    row.isArchived.equals(false) &
                    row.externalSource.isNull(),
              ))
              .get();
      final noteRows = await (select(
        notes,
      )..where((row) => row.deletedAt.isNull())).get();
      final focusRows = await (select(
        focusSessions,
      )..where((row) => row.deletedAt.isNull())).get();
      for (final row in taskRows) {
        await customStatement(
          'INSERT INTO search_index(id, entity_type, title, body) VALUES (?, ?, ?, ?)',
          [row.id, 'task', row.title, row.descriptionMd ?? ''],
        );
      }
      for (final row in noteRows) {
        await customStatement(
          'INSERT INTO search_index(id, entity_type, title, body) VALUES (?, ?, ?, ?)',
          [row.id, 'note', row.title, row.contentMd],
        );
      }
      for (final row in focusRows) {
        await customStatement(
          'INSERT INTO search_index(id, entity_type, title, body) VALUES (?, ?, ?, ?)',
          [
            row.id,
            'focus',
            row.taskName,
            '${row.status} ${row.reflection ?? ''}',
          ],
        );
      }
    });
  }

  String newId() => _uuid.v7();
}
