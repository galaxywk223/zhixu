import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../core/legacy_text.dart';
import 'database.dart';

const _uuid = Uuid();

class TaskDraft {
  const TaskDraft({
    required this.title,
    this.descriptionMd,
    this.priority = 1,
    this.dueAt,
    this.estimatedMinutes = 0,
    this.repeatRule,
    this.projectId,
  });

  final String title;
  final String? descriptionMd;
  final int priority;
  final DateTime? dueAt;
  final int estimatedMinutes;
  final String? repeatRule;
  final String? projectId;
}

class ProjectDraft {
  const ProjectDraft({
    required this.name,
    this.kind = 'project',
    this.descriptionMd,
    this.startDate,
    this.targetDate,
    this.colorHex = '#3B82F6',
  });

  final String name;
  final String kind;
  final String? descriptionMd;
  final DateTime? startDate;
  final DateTime? targetDate;
  final String colorHex;
}

class NoteDraft {
  const NoteDraft({
    required this.title,
    this.contentMd = '',
    this.notebookId,
    this.projectId,
    this.isPinned = false,
  });

  final String title;
  final String contentMd;
  final String? notebookId;
  final String? projectId;
  final bool isPinned;
}

class ScheduleDraft {
  const ScheduleDraft({
    required this.title,
    required this.startAt,
    required this.endAt,
    this.taskId,
    this.projectId,
    this.isAllDay = false,
    this.repeatRule,
    this.colorHex = '#2563EB',
  });

  final String title;
  final DateTime startAt;
  final DateTime endAt;
  final String? taskId;
  final String? projectId;
  final bool isAllDay;
  final String? repeatRule;
  final String colorHex;
}

class ImportedFocusSession {
  const ImportedFocusSession({
    required this.sourceKey,
    required this.startAt,
    required this.endAt,
    required this.taskName,
    required this.durationMinutes,
    required this.status,
    this.legacySourceKey,
    this.reflection,
  });

  final String sourceKey;
  final String? legacySourceKey;
  final DateTime startAt;
  final DateTime endAt;
  final String taskName;
  final int durationMinutes;
  final String status;
  final String? reflection;
}

class ImportResult {
  const ImportResult({
    required this.batchId,
    required this.importedCount,
    required this.updatedCount,
    required this.skippedCount,
    this.focusImportedCount = 0,
    this.lifeEventImportedCount = 0,
    this.tasksCreatedCount = 0,
  });

  final String batchId;
  final int importedCount;
  final int updatedCount;
  final int skippedCount;
  final int focusImportedCount;
  final int lifeEventImportedCount;
  final int tasksCreatedCount;
}

class SleepRecord {
  const SleepRecord({this.start, this.end, this.issue});

  final LifeEvent? start;
  final LifeEvent? end;
  final String? issue;

  Duration? get duration => start == null || end == null
      ? null
      : end!.occurredAt.difference(start!.occurredAt);
  bool get isValid {
    final value = duration;
    return issue == null &&
        value != null &&
        !value.isNegative &&
        value > Duration.zero &&
        value <= const Duration(hours: 24);
  }
}

class SearchHit {
  const SearchHit({
    required this.entityType,
    required this.id,
    required this.title,
  });

  final String entityType;
  final String id;
  final String title;
}

class ZhixuRepository {
  ZhixuRepository(this.db, {String? deviceId})
    : deviceId = deviceId ?? _uuid.v7();

  final ZhixuDatabase db;
  final String deviceId;

  Stream<List<Task>> watchTasks({bool includeArchived = false}) {
    final query = db.select(db.tasks)
      ..where(
        (row) =>
            row.deletedAt.isNull() & row.isArchived.equals(includeArchived),
      );
    return query.watch();
  }

  Stream<List<Project>> watchProjects() =>
      (db.select(db.projects)..where(
            (row) => row.deletedAt.isNull() & row.isArchived.equals(false),
          ))
          .watch();

  Stream<List<Note>> watchNotes() =>
      (db.select(db.notes)..where((row) => row.deletedAt.isNull())).watch();

  Stream<List<FocusSession>> watchFocusSessions() =>
      (db.select(db.focusSessions)
            ..where((row) => row.deletedAt.isNull())
            ..orderBy([
              (row) => OrderingTerm(
                expression: row.startAt,
                mode: OrderingMode.desc,
              ),
            ]))
          .watch();

  Stream<List<LifeEvent>> watchLifeEvents() =>
      (db.select(db.lifeEvents)
            ..where((row) => row.deletedAt.isNull())
            ..orderBy([
              (row) => OrderingTerm(
                expression: row.occurredAt,
                mode: OrderingMode.desc,
              ),
            ]))
          .watch();

  Stream<List<ImportBatche>> watchImportBatches() =>
      (db.select(db.importBatches)..orderBy([
            (row) => OrderingTerm(
              expression: row.createdAt,
              mode: OrderingMode.desc,
            ),
          ]))
          .watch();

  Stream<List<ScheduleBlock>> watchScheduleBlocks(
    DateTime start,
    DateTime end,
  ) {
    return (db.select(db.scheduleBlocks)
          ..where(
            (row) =>
                row.deletedAt.isNull() &
                row.startAt.isSmallerThanValue(end) &
                row.endAt.isBiggerThanValue(start),
          )
          ..orderBy([(row) => OrderingTerm(expression: row.startAt)]))
        .watch();
  }

  Future<List<Task>> tasksForDay(DateTime day) async {
    final start = DateTime(day.year, day.month, day.day);
    final end = start.add(const Duration(days: 1));
    return (db.select(db.tasks)
          ..where(
            (row) =>
                row.deletedAt.isNull() &
                row.isArchived.equals(false) &
                ((row.dueAt.isBetweenValues(start, end)) | row.dueAt.isNull()),
          )
          ..orderBy([
            (row) => OrderingTerm(expression: row.status),
            (row) => OrderingTerm(expression: row.dueAt),
          ]))
        .get();
  }

  Future<String> createTask(TaskDraft draft) async {
    final now = DateTime.now().toUtc();
    final id = db.newId();
    await db
        .into(db.tasks)
        .insert(
          TasksCompanion.insert(
            id: id,
            title: draft.title.trim(),
            descriptionMd: Value(draft.descriptionMd),
            priority: Value(draft.priority),
            dueAt: Value(draft.dueAt?.toUtc()),
            estimatedMinutes: Value(draft.estimatedMinutes),
            repeatRule: Value(draft.repeatRule),
            projectId: Value(draft.projectId),
            createdAt: now,
            updatedAt: now,
            deviceId: deviceId,
          ),
        );
    await _enqueue('task', id, 'upsert', await taskPayload(id));
    await db.rebuildSearchIndex();
    return id;
  }

  Future<void> updateTask(String id, TaskDraft draft) async {
    final now = DateTime.now().toUtc();
    await (db.update(db.tasks)..where((row) => row.id.equals(id))).write(
      TasksCompanion(
        title: Value(draft.title.trim()),
        descriptionMd: Value(draft.descriptionMd),
        priority: Value(draft.priority),
        dueAt: Value(draft.dueAt?.toUtc()),
        estimatedMinutes: Value(draft.estimatedMinutes),
        repeatRule: Value(draft.repeatRule),
        projectId: Value(draft.projectId),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('task', id, 'upsert', await taskPayload(id));
    await db.rebuildSearchIndex();
  }

  Future<void> setTaskStatus(String id, String status) async {
    final now = DateTime.now().toUtc();
    await (db.update(db.tasks)..where((row) => row.id.equals(id))).write(
      TasksCompanion(
        status: Value(status),
        completedAt: Value(status == 'done' ? now : null),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('task', id, 'upsert', await taskPayload(id));
  }

  Future<void> deleteTask(String id) async {
    final now = DateTime.now().toUtc();
    await (db.update(db.tasks)..where((row) => row.id.equals(id))).write(
      TasksCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('task', id, 'delete', await taskPayload(id));
    await db.rebuildSearchIndex();
  }

  Future<String> createProject(ProjectDraft draft) async {
    final now = DateTime.now().toUtc();
    final id = db.newId();
    await db
        .into(db.projects)
        .insert(
          ProjectsCompanion.insert(
            id: id,
            name: draft.name.trim(),
            kind: Value(draft.kind),
            descriptionMd: Value(draft.descriptionMd),
            startDate: Value(draft.startDate),
            targetDate: Value(draft.targetDate),
            colorHex: Value(draft.colorHex),
            createdAt: now,
            updatedAt: now,
            deviceId: deviceId,
          ),
        );
    await _enqueue('project', id, 'upsert', await projectPayload(id));
    await db.rebuildSearchIndex();
    return id;
  }

  Future<void> deleteProject(String id) async {
    final now = DateTime.now().toUtc();
    await (db.update(db.projects)..where((row) => row.id.equals(id))).write(
      ProjectsCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('project', id, 'delete', await projectPayload(id));
    await db.rebuildSearchIndex();
  }

  Future<String> createNote(NoteDraft draft) async {
    final now = DateTime.now().toUtc();
    final id = db.newId();
    await db
        .into(db.notes)
        .insert(
          NotesCompanion.insert(
            id: id,
            title: draft.title.trim(),
            contentMd: Value(draft.contentMd),
            notebookId: Value(draft.notebookId),
            projectId: Value(draft.projectId),
            isPinned: Value(draft.isPinned),
            createdAt: now,
            updatedAt: now,
            deviceId: deviceId,
          ),
        );
    await db
        .into(db.noteVersions)
        .insert(
          NoteVersionsCompanion.insert(
            id: db.newId(),
            noteId: id,
            title: draft.title,
            contentMd: draft.contentMd,
            createdAt: now,
            source: const Value('create'),
          ),
        );
    await _enqueue('note', id, 'upsert', await notePayload(id));
    await db.rebuildSearchIndex();
    return id;
  }

  Future<void> updateNote(String id, NoteDraft draft) async {
    final existing = await (db.select(
      db.notes,
    )..where((row) => row.id.equals(id))).getSingleOrNull();
    if (existing == null) return;
    final now = DateTime.now().toUtc();
    if (existing.title != draft.title ||
        existing.contentMd != draft.contentMd) {
      await db
          .into(db.noteVersions)
          .insert(
            NoteVersionsCompanion.insert(
              id: db.newId(),
              noteId: id,
              title: existing.title,
              contentMd: existing.contentMd,
              createdAt: now,
              source: const Value('edit'),
            ),
          );
    }
    await (db.update(db.notes)..where((row) => row.id.equals(id))).write(
      NotesCompanion(
        title: Value(draft.title.trim()),
        contentMd: Value(draft.contentMd),
        notebookId: Value(draft.notebookId),
        projectId: Value(draft.projectId),
        isPinned: Value(draft.isPinned),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('note', id, 'upsert', await notePayload(id));
    await db.rebuildSearchIndex();
  }

  Future<void> deleteNote(String id) async {
    final now = DateTime.now().toUtc();
    await (db.update(db.notes)..where((row) => row.id.equals(id))).write(
      NotesCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('note', id, 'delete', await notePayload(id));
    await db.rebuildSearchIndex();
  }

  Future<String> createScheduleBlock(ScheduleDraft draft) async {
    final now = DateTime.now().toUtc();
    final id = db.newId();
    await db
        .into(db.scheduleBlocks)
        .insert(
          ScheduleBlocksCompanion.insert(
            id: id,
            title: draft.title.trim(),
            taskId: Value(draft.taskId),
            projectId: Value(draft.projectId),
            startAt: draft.startAt.toUtc(),
            endAt: draft.endAt.toUtc(),
            isAllDay: Value(draft.isAllDay),
            repeatRule: Value(draft.repeatRule),
            colorHex: Value(draft.colorHex),
            createdAt: now,
            updatedAt: now,
            deviceId: deviceId,
          ),
        );
    await _enqueue('schedule_block', id, 'upsert', await schedulePayload(id));
    return id;
  }

  Future<ImportResult> importFocusSessions({
    required String fileName,
    required String fileHash,
    required List<ImportedFocusSession> sessions,
    String? exportUser,
    DateTime? rangeStart,
    DateTime? rangeEnd,
    int? declaredMinutes,
    int? declaredRecords,
  }) async {
    final batchId = db.newId();
    var imported = 0;
    var updated = 0;
    var skipped = 0;
    var focusImported = 0;
    var lifeEventImported = 0;
    var tasksCreated = 0;
    final now = DateTime.now().toUtc();
    final changedTasks = <String>{};
    final changedFocus = <String>{};
    final changedLifeEvents = <String>{};
    await db.transaction(() async {
      await db
          .into(db.importBatches)
          .insert(
            ImportBatchesCompanion.insert(
              id: batchId,
              source: 'tomatodo',
              fileName: fileName,
              fileHash: fileHash,
              exportUser: Value(exportUser),
              rangeStart: Value(rangeStart),
              rangeEnd: Value(rangeEnd),
              declaredMinutes: Value(declaredMinutes),
              declaredRecords: Value(declaredRecords),
              createdAt: now,
            ),
          );
      final positiveSessions = sessions
          .where((session) => session.durationMinutes > 0)
          .toList();
      final groups = <String, List<ImportedFocusSession>>{};
      for (final session in positiveSessions) {
        groups
            .putIfAbsent(normalizeImportedTitle(session.taskName), () => [])
            .add(session);
      }

      for (final entry in groups.entries) {
        final group = entry.value
          ..sort((a, b) => a.startAt.compareTo(b.startAt));
        final latest = group.last;
        final externalKey = importedTaskKey(latest.taskName);
        Task? linkedTask;

        final existingFocus = await db.select(db.focusSessions).get();
        for (final focus in existingFocus) {
          if (focus.linkedTaskId != null &&
              normalizeImportedTitle(repairLegacyTomatoText(focus.taskName)) ==
                  entry.key) {
            linkedTask =
                await (db.select(db.tasks)
                      ..where((row) => row.id.equals(focus.linkedTaskId!)))
                    .getSingleOrNull();
            if (linkedTask != null) break;
          }
        }
        linkedTask ??=
            await (db.select(db.tasks)..where(
                  (row) =>
                      row.deletedAt.isNull() &
                      row.externalKey.equals(externalKey),
                ))
                .getSingleOrNull();
        if (linkedTask == null) {
          final candidates = await (db.select(
            db.tasks,
          )..where((row) => row.deletedAt.isNull())).get();
          for (final task in candidates) {
            if (normalizeImportedTitle(task.title) == entry.key) {
              linkedTask = task;
              break;
            }
          }
        }
        if (linkedTask == null) {
          final id = db.newId();
          final status = mapImportedTaskStatus(latest.status);
          await db
              .into(db.tasks)
              .insert(
                TasksCompanion.insert(
                  id: id,
                  title: latest.taskName.trim(),
                  status: Value(status),
                  completedAt: Value(
                    status == 'done' ? latest.endAt.toUtc() : null,
                  ),
                  externalSource: const Value('tomatodo'),
                  externalKey: Value(externalKey),
                  createdByImportBatchId: Value(batchId),
                  createdAt: group.first.startAt.toUtc(),
                  updatedAt: now,
                  deviceId: deviceId,
                ),
              );
          linkedTask = await (db.select(
            db.tasks,
          )..where((row) => row.id.equals(id))).getSingle();
          await _recordImportChange(
            batchId,
            'task',
            id,
            'insert',
            null,
            _taskJson(linkedTask),
            now,
          );
          changedTasks.add(id);
          tasksCreated++;
        }

        for (final session in group) {
          final outcome = await _upsertImportedFocus(
            batchId: batchId,
            session: session,
            linkedTaskId: linkedTask.id,
            now: now,
          );
          if (outcome.$1 == 'insert') {
            imported++;
            focusImported++;
          } else if (outcome.$1 == 'update') {
            updated++;
          } else {
            skipped++;
          }
          if (outcome.$2 != null) changedFocus.add(outcome.$2!);
        }
      }

      for (final session in sessions.where(
        (item) => item.durationMinutes <= 0,
      )) {
        final outcome = await _upsertImportedLifeEvent(
          batchId: batchId,
          session: session,
          now: now,
        );
        if (outcome.$1 == 'insert') {
          imported++;
          lifeEventImported++;
        } else if (outcome.$1 == 'update') {
          updated++;
        } else {
          skipped++;
        }
        if (outcome.$2 != null) changedLifeEvents.add(outcome.$2!);
      }
      await (db.update(
        db.importBatches,
      )..where((row) => row.id.equals(batchId))).write(
        ImportBatchesCompanion(
          importedCount: Value(imported + updated),
          skippedCount: Value(skipped),
        ),
      );
    });
    for (final id in changedTasks) {
      await _enqueue('task', id, 'upsert', await taskPayload(id));
    }
    for (final id in changedFocus) {
      await _enqueue('focus_session', id, 'upsert', await focusPayload(id));
    }
    for (final id in changedLifeEvents) {
      await _enqueue('life_event', id, 'upsert', await lifeEventPayload(id));
    }
    await db.rebuildSearchIndex();
    return ImportResult(
      batchId: batchId,
      importedCount: imported,
      updatedCount: updated,
      skippedCount: skipped,
      focusImportedCount: focusImported,
      lifeEventImportedCount: lifeEventImported,
      tasksCreatedCount: tasksCreated,
    );
  }

  Future<void> rollbackImportBatch(String batchId) async {
    final syncChanges = <(String, String, String)>[];
    final now = DateTime.now().toUtc();
    await db.transaction(() async {
      final changes =
          await (db.select(db.importBatchChanges)
                ..where((row) => row.batchId.equals(batchId))
                ..orderBy([
                  (row) =>
                      OrderingTerm(expression: row.id, mode: OrderingMode.desc),
                ]))
              .get();
      if (changes.isEmpty) {
        final focusRows = await (db.select(
          db.focusSessions,
        )..where((row) => row.importBatchId.equals(batchId))).get();
        for (final row in focusRows) {
          await (db.update(
            db.focusSessions,
          )..where((item) => item.id.equals(row.id))).write(
            FocusSessionsCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
            ),
          );
          syncChanges.add(('focus_session', row.id, 'delete'));
        }
        final lifeRows = await (db.select(
          db.lifeEvents,
        )..where((row) => row.importBatchId.equals(batchId))).get();
        for (final row in lifeRows) {
          await (db.update(
            db.lifeEvents,
          )..where((item) => item.id.equals(row.id))).write(
            LifeEventsCompanion(deletedAt: Value(now), updatedAt: Value(now)),
          );
          syncChanges.add(('life_event', row.id, 'delete'));
        }
        final taskRows = await (db.select(
          db.tasks,
        )..where((row) => row.createdByImportBatchId.equals(batchId))).get();
        for (final row in taskRows) {
          await (db.update(
            db.tasks,
          )..where((item) => item.id.equals(row.id))).write(
            TasksCompanion(deletedAt: Value(now), updatedAt: Value(now)),
          );
          syncChanges.add(('task', row.id, 'delete'));
        }
      }
      for (final change in changes) {
        if (change.operation == 'insert') {
          if (change.entityType == 'focus_session') {
            await (db.update(
              db.focusSessions,
            )..where((row) => row.id.equals(change.entityId))).write(
              FocusSessionsCompanion(
                deletedAt: Value(now),
                updatedAt: Value(now),
              ),
            );
            syncChanges.add(('focus_session', change.entityId, 'delete'));
          } else if (change.entityType == 'life_event') {
            await (db.update(
              db.lifeEvents,
            )..where((row) => row.id.equals(change.entityId))).write(
              LifeEventsCompanion(deletedAt: Value(now), updatedAt: Value(now)),
            );
            syncChanges.add(('life_event', change.entityId, 'delete'));
          } else if (change.entityType == 'task') {
            final task =
                await (db.select(db.tasks)
                      ..where((row) => row.id.equals(change.entityId)))
                    .getSingleOrNull();
            final refs =
                await (db.select(db.focusSessions)..where(
                      (row) =>
                          row.linkedTaskId.equals(change.entityId) &
                          row.deletedAt.isNull(),
                    ))
                    .get();
            final after = change.afterJson == null
                ? null
                : jsonDecode(change.afterJson!) as Map<String, dynamic>;
            if (task != null &&
                refs.isEmpty &&
                after?['updated_at'] == task.updatedAt.toIso8601String()) {
              await (db.update(
                db.tasks,
              )..where((row) => row.id.equals(change.entityId))).write(
                TasksCompanion(deletedAt: Value(now), updatedAt: Value(now)),
              );
              syncChanges.add(('task', change.entityId, 'delete'));
            }
          }
        } else if (change.beforeJson != null) {
          final before = jsonDecode(change.beforeJson!) as Map<String, dynamic>;
          if (change.entityType == 'focus_session') {
            await db
                .into(db.focusSessions)
                .insertOnConflictUpdate(_focusCompanion(before));
            syncChanges.add(('focus_session', change.entityId, 'upsert'));
          } else if (change.entityType == 'life_event') {
            await db
                .into(db.lifeEvents)
                .insertOnConflictUpdate(_lifeEventCompanion(before));
            syncChanges.add(('life_event', change.entityId, 'upsert'));
          }
        }
      }
      await (db.update(
        db.importBatches,
      )..where((row) => row.id.equals(batchId))).write(
        ImportBatchesCompanion(rolledBackAt: Value(DateTime.now().toUtc())),
      );
    });
    for (final change in syncChanges) {
      final payload = switch (change.$1) {
        'task' => await taskPayload(change.$2),
        'focus_session' => await focusPayload(change.$2),
        'life_event' => await lifeEventPayload(change.$2),
        _ => null,
      };
      await _enqueue(change.$1, change.$2, change.$3, payload);
    }
    await db.rebuildSearchIndex();
  }

  Future<(String, String?)> _upsertImportedFocus({
    required String batchId,
    required ImportedFocusSession session,
    required String linkedTaskId,
    required DateTime now,
  }) async {
    final keys = <String>{session.sourceKey};
    if (session.legacySourceKey != null) keys.add(session.legacySourceKey!);
    final matches = await (db.select(
      db.focusSessions,
    )..where((row) => row.sourceKey.isIn(keys))).get();
    final existing = matches.isEmpty
        ? null
        : matches.firstWhere(
            (row) => row.sourceKey == session.sourceKey,
            orElse: () => matches.first,
          );
    if (existing == null) {
      final id = db.newId();
      await db
          .into(db.focusSessions)
          .insert(
            FocusSessionsCompanion.insert(
              id: id,
              sourceKey: session.sourceKey,
              startAt: session.startAt.toUtc(),
              endAt: session.endAt.toUtc(),
              taskName: session.taskName,
              durationMinutes: session.durationMinutes,
              reflection: Value(session.reflection),
              status: session.status,
              linkedTaskId: Value(linkedTaskId),
              importBatchId: Value(batchId),
              createdAt: now,
              updatedAt: now,
              deviceId: deviceId,
            ),
          );
      final inserted = await (db.select(
        db.focusSessions,
      )..where((row) => row.id.equals(id))).getSingle();
      await _recordImportChange(
        batchId,
        'focus_session',
        id,
        'insert',
        null,
        _focusJson(inserted),
        now,
      );
      return ('insert', id);
    }

    final changed =
        existing.sourceKey != session.sourceKey ||
        existing.startAt.millisecondsSinceEpoch !=
            session.startAt.toUtc().millisecondsSinceEpoch ||
        existing.endAt.millisecondsSinceEpoch !=
            session.endAt.toUtc().millisecondsSinceEpoch ||
        existing.taskName != session.taskName ||
        existing.durationMinutes != session.durationMinutes ||
        existing.reflection != session.reflection ||
        existing.status != session.status ||
        existing.linkedTaskId != linkedTaskId ||
        existing.deletedAt != null;
    if (!changed) return ('skip', null);
    final before = _focusJson(existing);
    await (db.update(
      db.focusSessions,
    )..where((row) => row.id.equals(existing.id))).write(
      FocusSessionsCompanion(
        sourceKey: Value(session.sourceKey),
        startAt: Value(session.startAt.toUtc()),
        endAt: Value(session.endAt.toUtc()),
        taskName: Value(session.taskName),
        durationMinutes: Value(session.durationMinutes),
        reflection: Value(session.reflection),
        status: Value(session.status),
        linkedTaskId: Value(linkedTaskId),
        deletedAt: const Value(null),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    final after = await (db.select(
      db.focusSessions,
    )..where((row) => row.id.equals(existing.id))).getSingle();
    await _recordImportChange(
      batchId,
      'focus_session',
      existing.id,
      'update',
      before,
      _focusJson(after),
      now,
    );
    return ('update', existing.id);
  }

  Future<(String, String?)> _upsertImportedLifeEvent({
    required String batchId,
    required ImportedFocusSession session,
    required DateTime now,
  }) async {
    final keys = <String>{session.sourceKey};
    if (session.legacySourceKey != null) keys.add(session.legacySourceKey!);
    final matches = await (db.select(
      db.lifeEvents,
    )..where((row) => row.sourceKey.isIn(keys))).get();
    final existing = matches.isEmpty
        ? null
        : matches.firstWhere(
            (row) => row.sourceKey == session.sourceKey,
            orElse: () => matches.first,
          );
    final kind = classifyLifeEvent(session.taskName);
    if (existing == null) {
      final id = db.newId();
      await db
          .into(db.lifeEvents)
          .insert(
            LifeEventsCompanion.insert(
              id: id,
              sourceKey: session.sourceKey,
              kind: Value(kind),
              title: session.taskName,
              occurredAt: session.startAt.toUtc(),
              note: Value(session.reflection),
              importBatchId: Value(batchId),
              createdAt: now,
              updatedAt: now,
              deviceId: deviceId,
            ),
          );
      final inserted = await (db.select(
        db.lifeEvents,
      )..where((row) => row.id.equals(id))).getSingle();
      await _recordImportChange(
        batchId,
        'life_event',
        id,
        'insert',
        null,
        _lifeEventJson(inserted),
        now,
      );
      return ('insert', id);
    }
    final changed =
        existing.sourceKey != session.sourceKey ||
        existing.kind != kind ||
        existing.title != session.taskName ||
        existing.occurredAt.millisecondsSinceEpoch !=
            session.startAt.toUtc().millisecondsSinceEpoch ||
        existing.note != session.reflection ||
        existing.deletedAt != null;
    if (!changed) return ('skip', null);
    final before = _lifeEventJson(existing);
    await (db.update(
      db.lifeEvents,
    )..where((row) => row.id.equals(existing.id))).write(
      LifeEventsCompanion(
        sourceKey: Value(session.sourceKey),
        kind: Value(kind),
        title: Value(session.taskName),
        occurredAt: Value(session.startAt.toUtc()),
        note: Value(session.reflection),
        deletedAt: const Value(null),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    final after = await (db.select(
      db.lifeEvents,
    )..where((row) => row.id.equals(existing.id))).getSingle();
    await _recordImportChange(
      batchId,
      'life_event',
      existing.id,
      'update',
      before,
      _lifeEventJson(after),
      now,
    );
    return ('update', existing.id);
  }

  Future<void> _recordImportChange(
    String batchId,
    String entityType,
    String entityId,
    String operation,
    Map<String, dynamic>? before,
    Map<String, dynamic>? after,
    DateTime now,
  ) => db
      .into(db.importBatchChanges)
      .insert(
        ImportBatchChangesCompanion.insert(
          batchId: batchId,
          entityType: entityType,
          entityId: entityId,
          operation: operation,
          beforeJson: Value(before == null ? null : jsonEncode(before)),
          afterJson: Value(after == null ? null : jsonEncode(after)),
          createdAt: now,
        ),
      );

  Future<void> reconcileLegacyTomatoData() async {
    final changedTasks = <String>{};
    final changedFocus = <String>{};
    final changedLifeEvents = <String>{};
    await db.transaction(() async {
      final now = DateTime.now().toUtc();
      final existingRows = await db.select(db.focusSessions).get();
      for (final row in existingRows) {
        final title = repairLegacyTomatoText(row.taskName);
        final status = repairLegacyTomatoText(row.status);
        final reflection = row.reflection == null
            ? null
            : repairLegacyTomatoText(row.reflection!);
        final canonicalKey = tomatoSourceKey(row.startAt, row.endAt, title);
        if (row.durationMinutes <= 0) {
          final existingEvent =
              await (db.select(db.lifeEvents)
                    ..where((event) => event.sourceKey.equals(canonicalKey)))
                  .getSingleOrNull();
          if (existingEvent == null) {
            await db
                .into(db.lifeEvents)
                .insert(
                  LifeEventsCompanion.insert(
                    id: row.id,
                    sourceKey: canonicalKey,
                    source: Value(row.source),
                    kind: Value(classifyLifeEvent(title)),
                    title: title,
                    occurredAt: row.startAt,
                    note: Value(reflection),
                    importBatchId: Value(row.importBatchId),
                    createdAt: row.createdAt,
                    updatedAt: now,
                    deviceId: deviceId,
                    serverRevision: Value(row.serverRevision),
                  ),
                );
            changedLifeEvents.add(row.id);
          }
          await (db.update(
            db.focusSessions,
          )..where((focus) => focus.id.equals(row.id))).write(
            FocusSessionsCompanion(
              deletedAt: Value(now),
              updatedAt: Value(now),
            ),
          );
          changedFocus.add(row.id);
        } else {
          final collision =
              await (db.select(db.focusSessions)..where(
                    (focus) =>
                        focus.sourceKey.equals(canonicalKey) &
                        focus.id.equals(row.id).not(),
                  ))
                  .getSingleOrNull();
          if (collision != null) {
            await (db.delete(
              db.focusSessions,
            )..where((focus) => focus.id.equals(row.id))).go();
          } else {
            if (row.sourceKey != canonicalKey ||
                row.taskName != title ||
                row.status != status ||
                row.reflection != reflection) {
              await (db.update(
                db.focusSessions,
              )..where((focus) => focus.id.equals(row.id))).write(
                FocusSessionsCompanion(
                  sourceKey: Value(canonicalKey),
                  taskName: Value(title),
                  status: Value(status),
                  reflection: Value(reflection),
                  updatedAt: Value(now),
                ),
              );
              changedFocus.add(row.id);
            }
          }
        }
      }

      final focusRows = await (db.select(
        db.focusSessions,
      )..where((row) => row.deletedAt.isNull())).get();
      final groups = <String, List<FocusSession>>{};
      for (final row in focusRows) {
        groups
            .putIfAbsent(normalizeImportedTitle(row.taskName), () => [])
            .add(row);
      }
      final tasks = await (db.select(
        db.tasks,
      )..where((row) => row.deletedAt.isNull())).get();
      for (final entry in groups.entries) {
        final rows = entry.value
          ..sort((a, b) => a.startAt.compareTo(b.startAt));
        Task? task;
        for (final row in rows) {
          if (row.linkedTaskId == null) continue;
          for (final candidate in tasks) {
            if (candidate.id == row.linkedTaskId) task = candidate;
          }
        }
        task ??= tasks.cast<Task?>().firstWhere(
          (candidate) =>
              candidate != null &&
              (candidate.externalKey == importedTaskKey(rows.last.taskName) ||
                  normalizeImportedTitle(candidate.title) == entry.key),
          orElse: () => null,
        );
        if (task == null) {
          final id = db.newId();
          final latest = rows.last;
          final mappedStatus = mapImportedTaskStatus(latest.status);
          await db
              .into(db.tasks)
              .insert(
                TasksCompanion.insert(
                  id: id,
                  title: latest.taskName,
                  status: Value(mappedStatus),
                  completedAt: Value(
                    mappedStatus == 'done' ? latest.endAt : null,
                  ),
                  externalSource: const Value('tomatodo'),
                  externalKey: Value(importedTaskKey(latest.taskName)),
                  createdByImportBatchId: Value(latest.importBatchId),
                  createdAt: rows.first.startAt,
                  updatedAt: now,
                  deviceId: deviceId,
                ),
              );
          task = await (db.select(
            db.tasks,
          )..where((row) => row.id.equals(id))).getSingle();
          tasks.add(task);
          changedTasks.add(task.id);
        }
        for (final row in rows.where((item) => item.linkedTaskId != task!.id)) {
          await (db.update(
            db.focusSessions,
          )..where((item) => item.id.equals(row.id))).write(
            FocusSessionsCompanion(
              linkedTaskId: Value(task.id),
              updatedAt: Value(now),
            ),
          );
          changedFocus.add(row.id);
        }
      }
    });
    for (final id in changedTasks) {
      await _enqueue('task', id, 'upsert', await taskPayload(id));
    }
    for (final id in changedFocus) {
      await _enqueue('focus_session', id, 'upsert', await focusPayload(id));
    }
    for (final id in changedLifeEvents) {
      await _enqueue('life_event', id, 'upsert', await lifeEventPayload(id));
    }
    await db.rebuildSearchIndex();
  }

  Future<String> createLifeEvent({
    required String kind,
    required String title,
    required DateTime occurredAt,
    String? note,
  }) async {
    final id = db.newId();
    final now = DateTime.now().toUtc();
    await db
        .into(db.lifeEvents)
        .insert(
          LifeEventsCompanion.insert(
            id: id,
            sourceKey: 'manual|$id',
            source: const Value('manual'),
            kind: Value(kind),
            title: title.trim(),
            occurredAt: occurredAt.toUtc(),
            note: Value(note),
            createdAt: now,
            updatedAt: now,
            deviceId: deviceId,
          ),
        );
    await _enqueue('life_event', id, 'upsert', await lifeEventPayload(id));
    return id;
  }

  Future<void> updateLifeEvent(
    String id, {
    required String kind,
    required String title,
    required DateTime occurredAt,
    String? note,
  }) async {
    final now = DateTime.now().toUtc();
    await (db.update(db.lifeEvents)..where((row) => row.id.equals(id))).write(
      LifeEventsCompanion(
        kind: Value(kind),
        title: Value(title.trim()),
        occurredAt: Value(occurredAt.toUtc()),
        note: Value(note),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('life_event', id, 'upsert', await lifeEventPayload(id));
  }

  Future<void> deleteLifeEvent(String id) async {
    final now = DateTime.now().toUtc();
    await (db.update(db.lifeEvents)..where((row) => row.id.equals(id))).write(
      LifeEventsCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        deviceId: Value(deviceId),
      ),
    );
    await _enqueue('life_event', id, 'delete', await lifeEventPayload(id));
  }

  Future<int> focusMinutes({DateTime? start, DateTime? end}) async {
    final rows =
        await (db.select(db.focusSessions)..where(
              (row) =>
                  row.deletedAt.isNull() &
                  (start == null
                      ? const Constant(true)
                      : row.startAt.isBiggerOrEqualValue(start)) &
                  (end == null
                      ? const Constant(true)
                      : row.startAt.isSmallerThanValue(end)),
            ))
            .get();
    return rows.fold<int>(
      0,
      (sum, row) => sum + (row.durationMinutes > 0 ? row.durationMinutes : 0),
    );
  }

  Future<List<SearchHit>> search(String query) async {
    final needle = '%${query.trim()}%';
    if (query.trim().isEmpty) return const [];
    final rows = await db
        .customSelect(
          '''SELECT 'task' AS entity_type, id, title FROM tasks WHERE deleted_at IS NULL AND (title LIKE ? OR description_md LIKE ?)
         UNION ALL SELECT 'project', id, name FROM projects WHERE deleted_at IS NULL AND (name LIKE ? OR description_md LIKE ?)
         UNION ALL SELECT 'note', id, title FROM notes WHERE deleted_at IS NULL AND (title LIKE ? OR content_md LIKE ?)
         LIMIT 40''',
          variables: [
            Variable.withString(needle),
            Variable.withString(needle),
            Variable.withString(needle),
            Variable.withString(needle),
            Variable.withString(needle),
            Variable.withString(needle),
          ],
        )
        .get();
    return rows
        .map(
          (row) => SearchHit(
            entityType: row.read<String>('entity_type'),
            id: row.read<String>('id'),
            title: row.read<String>('title'),
          ),
        )
        .toList();
  }

  Future<Map<String, dynamic>> exportPayload() async {
    return {
      'schema_version': 2,
      'exported_at': DateTime.now().toUtc().toIso8601String(),
      'tasks': (await db.select(db.tasks).get()).map(_taskJson).toList(),
      'projects': (await db.select(db.projects).get())
          .map(_projectJson)
          .toList(),
      'schedule_blocks': (await db.select(db.scheduleBlocks).get())
          .map(_scheduleJson)
          .toList(),
      'notes': (await db.select(db.notes).get()).map(_noteJson).toList(),
      'note_versions': (await db.select(db.noteVersions).get())
          .map(_noteVersionJson)
          .toList(),
      'focus_sessions': (await db.select(db.focusSessions).get())
          .map(_focusJson)
          .toList(),
      'life_events': (await db.select(db.lifeEvents).get())
          .map(_lifeEventJson)
          .toList(),
      'import_batches': (await db.select(db.importBatches).get())
          .map(_batchJson)
          .toList(),
      'import_batch_changes': (await db.select(db.importBatchChanges).get())
          .map(_batchChangeJson)
          .toList(),
    };
  }

  Future<void> restorePayload(Map<String, dynamic> payload) async {
    await db.transaction(() async {
      await db.delete(db.noteVersions).go();
      await db.delete(db.notes).go();
      await db.delete(db.scheduleBlocks).go();
      await db.delete(db.tasks).go();
      await db.delete(db.projects).go();
      await db.delete(db.focusSessions).go();
      await db.delete(db.lifeEvents).go();
      await db.delete(db.importBatchChanges).go();
      await db.delete(db.importBatches).go();
      for (final raw in (payload['tasks'] as List? ?? const [])) {
        await db.into(db.tasks).insert(_taskCompanion(raw as Map));
      }
      for (final raw in (payload['projects'] as List? ?? const [])) {
        await db.into(db.projects).insert(_projectCompanion(raw as Map));
      }
      for (final raw in (payload['schedule_blocks'] as List? ?? const [])) {
        await db.into(db.scheduleBlocks).insert(_scheduleCompanion(raw as Map));
      }
      for (final raw in (payload['notes'] as List? ?? const [])) {
        await db.into(db.notes).insert(_noteCompanion(raw as Map));
      }
      for (final raw in (payload['note_versions'] as List? ?? const [])) {
        await db
            .into(db.noteVersions)
            .insert(_noteVersionCompanion(raw as Map));
      }
      for (final raw in (payload['focus_sessions'] as List? ?? const [])) {
        await db.into(db.focusSessions).insert(_focusCompanion(raw as Map));
      }
      for (final raw in (payload['life_events'] as List? ?? const [])) {
        await db.into(db.lifeEvents).insert(_lifeEventCompanion(raw as Map));
      }
      for (final raw in (payload['import_batches'] as List? ?? const [])) {
        await db.into(db.importBatches).insert(_batchCompanion(raw as Map));
      }
      for (final raw
          in (payload['import_batch_changes'] as List? ?? const [])) {
        await db
            .into(db.importBatchChanges)
            .insert(_batchChangeCompanion(raw as Map));
      }
    });
    await db.rebuildSearchIndex();
  }

  Future<Map<String, dynamic>?> taskPayload(String id) async {
    final row = await (db.select(
      db.tasks,
    )..where((item) => item.id.equals(id))).getSingleOrNull();
    return row == null ? null : _taskJson(row);
  }

  Future<Map<String, dynamic>?> projectPayload(String id) async {
    final row = await (db.select(
      db.projects,
    )..where((item) => item.id.equals(id))).getSingleOrNull();
    return row == null ? null : _projectJson(row);
  }

  Future<Map<String, dynamic>?> notePayload(String id) async {
    final row = await (db.select(
      db.notes,
    )..where((item) => item.id.equals(id))).getSingleOrNull();
    return row == null ? null : _noteJson(row);
  }

  Future<Map<String, dynamic>?> schedulePayload(String id) async {
    final row = await (db.select(
      db.scheduleBlocks,
    )..where((item) => item.id.equals(id))).getSingleOrNull();
    return row == null ? null : _scheduleJson(row);
  }

  Future<Map<String, dynamic>?> focusPayload(String id) async {
    final row = await (db.select(
      db.focusSessions,
    )..where((item) => item.id.equals(id))).getSingleOrNull();
    return row == null ? null : _focusJson(row);
  }

  Future<Map<String, dynamic>?> lifeEventPayload(String id) async {
    final row = await (db.select(
      db.lifeEvents,
    )..where((item) => item.id.equals(id))).getSingleOrNull();
    return row == null ? null : _lifeEventJson(row);
  }

  Future<List<SyncOutboxData>> pendingOutbox() => (db.select(
    db.syncOutbox,
  )..orderBy([(row) => OrderingTerm(expression: row.createdAt)])).get();

  Future<void> removeOutbox(int id) =>
      (db.delete(db.syncOutbox)..where((row) => row.id.equals(id))).go();

  Future<DateTime?> syncCursor(String entityType) async {
    final row = await (db.select(
      db.syncCursors,
    )..where((item) => item.entityType.equals(entityType))).getSingleOrNull();
    return row?.cursor;
  }

  Future<void> saveSyncCursor(String entityType, DateTime cursor) async {
    await db
        .into(db.syncCursors)
        .insertOnConflictUpdate(
          SyncCursorsCompanion.insert(
            entityType: entityType,
            cursor: Value(cursor.toUtc()),
          ),
        );
  }

  Future<void> applyRemoteEntity(
    String entityType,
    Map<String, dynamic> raw,
  ) async {
    switch (entityType) {
      case 'task':
        await db.into(db.tasks).insertOnConflictUpdate(_taskCompanion(raw));
      case 'project':
        await db
            .into(db.projects)
            .insertOnConflictUpdate(_projectCompanion(raw));
      case 'note':
        await db.into(db.notes).insertOnConflictUpdate(_noteCompanion(raw));
      case 'schedule_block':
        await db
            .into(db.scheduleBlocks)
            .insertOnConflictUpdate(_scheduleCompanion(raw));
      case 'focus_session':
        await db
            .into(db.focusSessions)
            .insertOnConflictUpdate(_focusCompanion(raw));
      case 'life_event':
        await db
            .into(db.lifeEvents)
            .insertOnConflictUpdate(_lifeEventCompanion(raw));
    }
  }

  Future<void> _enqueue(
    String type,
    String id,
    String operation,
    Map<String, dynamic>? payload,
  ) async {
    await db
        .into(db.syncOutbox)
        .insert(
          SyncOutboxCompanion.insert(
            entityType: type,
            entityId: id,
            operation: operation,
            payloadJson: jsonEncode(payload),
            createdAt: DateTime.now().toUtc(),
          ),
        );
  }
}

Map<String, dynamic> _taskJson(Task row) => {
  'id': row.id,
  'title': row.title,
  'description_md': row.descriptionMd,
  'status': row.status,
  'priority': row.priority,
  'due_at': row.dueAt?.toIso8601String(),
  'estimated_minutes': row.estimatedMinutes,
  'repeat_rule': row.repeatRule,
  'project_id': row.projectId,
  'parent_task_id': row.parentTaskId,
  'external_source': row.externalSource,
  'external_key': row.externalKey,
  'created_by_import_batch_id': row.createdByImportBatchId,
  'completed_at': row.completedAt?.toIso8601String(),
  'is_archived': row.isArchived,
  'created_at': row.createdAt.toIso8601String(),
  'updated_at': row.updatedAt.toIso8601String(),
  'deleted_at': row.deletedAt?.toIso8601String(),
  'device_id': row.deviceId,
  'server_revision': row.serverRevision,
};

Map<String, dynamic> _projectJson(Project row) => {
  'id': row.id,
  'name': row.name,
  'kind': row.kind,
  'description_md': row.descriptionMd,
  'start_date': row.startDate?.toIso8601String(),
  'target_date': row.targetDate?.toIso8601String(),
  'color_hex': row.colorHex,
  'is_archived': row.isArchived,
  'created_at': row.createdAt.toIso8601String(),
  'updated_at': row.updatedAt.toIso8601String(),
  'deleted_at': row.deletedAt?.toIso8601String(),
  'device_id': row.deviceId,
  'server_revision': row.serverRevision,
};

Map<String, dynamic> _scheduleJson(ScheduleBlock row) => {
  'id': row.id,
  'title': row.title,
  'task_id': row.taskId,
  'project_id': row.projectId,
  'start_at': row.startAt.toIso8601String(),
  'end_at': row.endAt.toIso8601String(),
  'is_all_day': row.isAllDay,
  'repeat_rule': row.repeatRule,
  'color_hex': row.colorHex,
  'created_at': row.createdAt.toIso8601String(),
  'updated_at': row.updatedAt.toIso8601String(),
  'deleted_at': row.deletedAt?.toIso8601String(),
  'device_id': row.deviceId,
  'server_revision': row.serverRevision,
};

Map<String, dynamic> _noteJson(Note row) => {
  'id': row.id,
  'title': row.title,
  'content_md': row.contentMd,
  'notebook_id': row.notebookId,
  'project_id': row.projectId,
  'is_pinned': row.isPinned,
  'created_at': row.createdAt.toIso8601String(),
  'updated_at': row.updatedAt.toIso8601String(),
  'deleted_at': row.deletedAt?.toIso8601String(),
  'device_id': row.deviceId,
  'server_revision': row.serverRevision,
};

Map<String, dynamic> _noteVersionJson(NoteVersion row) => {
  'id': row.id,
  'note_id': row.noteId,
  'title': row.title,
  'content_md': row.contentMd,
  'created_at': row.createdAt.toIso8601String(),
  'source': row.source,
};

Map<String, dynamic> _focusJson(FocusSession row) => {
  'id': row.id,
  'source_key': row.sourceKey,
  'source': row.source,
  'start_at': row.startAt.toIso8601String(),
  'end_at': row.endAt.toIso8601String(),
  'task_name': row.taskName,
  'duration_minutes': row.durationMinutes,
  'reflection': row.reflection,
  'status': row.status,
  'completion_percent': row.completionPercent,
  'linked_task_id': row.linkedTaskId,
  'linked_project_id': row.linkedProjectId,
  'import_batch_id': row.importBatchId,
  'created_at': row.createdAt.toIso8601String(),
  'updated_at': row.updatedAt.toIso8601String(),
  'deleted_at': row.deletedAt?.toIso8601String(),
  'device_id': row.deviceId,
  'server_revision': row.serverRevision,
};

Map<String, dynamic> _lifeEventJson(LifeEvent row) => {
  'id': row.id,
  'source_key': row.sourceKey,
  'source': row.source,
  'kind': row.kind,
  'title': row.title,
  'occurred_at': row.occurredAt.toIso8601String(),
  'note': row.note,
  'import_batch_id': row.importBatchId,
  'created_at': row.createdAt.toIso8601String(),
  'updated_at': row.updatedAt.toIso8601String(),
  'deleted_at': row.deletedAt?.toIso8601String(),
  'device_id': row.deviceId,
  'server_revision': row.serverRevision,
};

Map<String, dynamic> _batchJson(ImportBatche row) => {
  'id': row.id,
  'source': row.source,
  'file_name': row.fileName,
  'file_hash': row.fileHash,
  'export_user': row.exportUser,
  'range_start': row.rangeStart?.toIso8601String(),
  'range_end': row.rangeEnd?.toIso8601String(),
  'declared_minutes': row.declaredMinutes,
  'declared_records': row.declaredRecords,
  'imported_count': row.importedCount,
  'skipped_count': row.skippedCount,
  'error_message': row.errorMessage,
  'created_at': row.createdAt.toIso8601String(),
  'rolled_back_at': row.rolledBackAt?.toIso8601String(),
};

Map<String, dynamic> _batchChangeJson(ImportBatchChange row) => {
  'id': row.id,
  'batch_id': row.batchId,
  'entity_type': row.entityType,
  'entity_id': row.entityId,
  'operation': row.operation,
  'before_json': row.beforeJson,
  'after_json': row.afterJson,
  'created_at': row.createdAt.toIso8601String(),
};

DateTime? _date(dynamic value) =>
    value == null ? null : DateTime.parse(value as String);

TasksCompanion _taskCompanion(Map raw) => TasksCompanion.insert(
  id: raw['id'] as String,
  title: raw['title'] as String,
  descriptionMd: Value(raw['description_md'] as String?),
  status: Value(raw['status'] as String? ?? 'todo'),
  priority: Value(raw['priority'] as int? ?? 1),
  dueAt: Value(_date(raw['due_at'])),
  estimatedMinutes: Value(raw['estimated_minutes'] as int? ?? 0),
  repeatRule: Value(raw['repeat_rule'] as String?),
  projectId: Value(raw['project_id'] as String?),
  parentTaskId: Value(raw['parent_task_id'] as String?),
  externalSource: Value(raw['external_source'] as String?),
  externalKey: Value(raw['external_key'] as String?),
  createdByImportBatchId: Value(raw['created_by_import_batch_id'] as String?),
  completedAt: Value(_date(raw['completed_at'])),
  isArchived: Value(raw['is_archived'] as bool? ?? false),
  createdAt: DateTime.parse(raw['created_at'] as String),
  updatedAt: DateTime.parse(raw['updated_at'] as String),
  deletedAt: Value(_date(raw['deleted_at'])),
  deviceId: raw['device_id'] as String? ?? 'restore',
  serverRevision: Value(raw['server_revision'] as int? ?? 0),
);

ProjectsCompanion _projectCompanion(Map raw) => ProjectsCompanion.insert(
  id: raw['id'] as String,
  name: raw['name'] as String,
  kind: Value(raw['kind'] as String? ?? 'project'),
  descriptionMd: Value(raw['description_md'] as String?),
  startDate: Value(_date(raw['start_date'])),
  targetDate: Value(_date(raw['target_date'])),
  colorHex: Value(raw['color_hex'] as String? ?? '#3B82F6'),
  isArchived: Value(raw['is_archived'] as bool? ?? false),
  createdAt: DateTime.parse(raw['created_at'] as String),
  updatedAt: DateTime.parse(raw['updated_at'] as String),
  deletedAt: Value(_date(raw['deleted_at'])),
  deviceId: raw['device_id'] as String? ?? 'restore',
  serverRevision: Value(raw['server_revision'] as int? ?? 0),
);

ScheduleBlocksCompanion _scheduleCompanion(Map raw) =>
    ScheduleBlocksCompanion.insert(
      id: raw['id'] as String,
      title: raw['title'] as String,
      taskId: Value(raw['task_id'] as String?),
      projectId: Value(raw['project_id'] as String?),
      startAt: DateTime.parse(raw['start_at'] as String),
      endAt: DateTime.parse(raw['end_at'] as String),
      isAllDay: Value(raw['is_all_day'] as bool? ?? false),
      repeatRule: Value(raw['repeat_rule'] as String?),
      colorHex: Value(raw['color_hex'] as String? ?? '#2563EB'),
      createdAt: DateTime.parse(raw['created_at'] as String),
      updatedAt: DateTime.parse(raw['updated_at'] as String),
      deletedAt: Value(_date(raw['deleted_at'])),
      deviceId: raw['device_id'] as String? ?? 'restore',
      serverRevision: Value(raw['server_revision'] as int? ?? 0),
    );

NotesCompanion _noteCompanion(Map raw) => NotesCompanion.insert(
  id: raw['id'] as String,
  title: raw['title'] as String,
  contentMd: Value(raw['content_md'] as String? ?? ''),
  notebookId: Value(raw['notebook_id'] as String?),
  projectId: Value(raw['project_id'] as String?),
  isPinned: Value(raw['is_pinned'] as bool? ?? false),
  createdAt: DateTime.parse(raw['created_at'] as String),
  updatedAt: DateTime.parse(raw['updated_at'] as String),
  deletedAt: Value(_date(raw['deleted_at'])),
  deviceId: raw['device_id'] as String? ?? 'restore',
  serverRevision: Value(raw['server_revision'] as int? ?? 0),
);

NoteVersionsCompanion _noteVersionCompanion(Map raw) =>
    NoteVersionsCompanion.insert(
      id: raw['id'] as String,
      noteId: raw['note_id'] as String,
      title: raw['title'] as String,
      contentMd: raw['content_md'] as String,
      createdAt: DateTime.parse(raw['created_at'] as String),
      source: Value(raw['source'] as String? ?? 'restore'),
    );

FocusSessionsCompanion _focusCompanion(Map raw) =>
    FocusSessionsCompanion.insert(
      id: raw['id'] as String,
      sourceKey: raw['source_key'] as String,
      source: Value(raw['source'] as String? ?? 'tomatodo'),
      startAt: DateTime.parse(raw['start_at'] as String),
      endAt: DateTime.parse(raw['end_at'] as String),
      taskName: raw['task_name'] as String,
      durationMinutes: raw['duration_minutes'] as int,
      reflection: Value(raw['reflection'] as String?),
      status: raw['status'] as String,
      completionPercent: Value(raw['completion_percent'] as int? ?? 0),
      linkedTaskId: Value(raw['linked_task_id'] as String?),
      linkedProjectId: Value(raw['linked_project_id'] as String?),
      importBatchId: Value(raw['import_batch_id'] as String?),
      createdAt: DateTime.parse(raw['created_at'] as String),
      updatedAt: DateTime.parse(raw['updated_at'] as String),
      deletedAt: Value(_date(raw['deleted_at'])),
      deviceId: raw['device_id'] as String? ?? 'restore',
      serverRevision: Value(raw['server_revision'] as int? ?? 0),
    );

LifeEventsCompanion _lifeEventCompanion(Map raw) => LifeEventsCompanion.insert(
  id: raw['id'] as String,
  sourceKey: raw['source_key'] as String,
  source: Value(raw['source'] as String? ?? 'tomatodo'),
  kind: Value(raw['kind'] as String? ?? 'other'),
  title: raw['title'] as String,
  occurredAt: DateTime.parse(raw['occurred_at'] as String),
  note: Value(raw['note'] as String?),
  importBatchId: Value(raw['import_batch_id'] as String?),
  createdAt: DateTime.parse(raw['created_at'] as String),
  updatedAt: DateTime.parse(raw['updated_at'] as String),
  deletedAt: Value(_date(raw['deleted_at'])),
  deviceId: raw['device_id'] as String? ?? 'restore',
  serverRevision: Value(raw['server_revision'] as int? ?? 0),
);

ImportBatchesCompanion _batchCompanion(Map raw) =>
    ImportBatchesCompanion.insert(
      id: raw['id'] as String,
      source: raw['source'] as String? ?? 'tomatodo',
      fileName: raw['file_name'] as String,
      fileHash: raw['file_hash'] as String,
      exportUser: Value(raw['export_user'] as String?),
      rangeStart: Value(_date(raw['range_start'])),
      rangeEnd: Value(_date(raw['range_end'])),
      declaredMinutes: Value(raw['declared_minutes'] as int?),
      declaredRecords: Value(raw['declared_records'] as int?),
      importedCount: Value(raw['imported_count'] as int? ?? 0),
      skippedCount: Value(raw['skipped_count'] as int? ?? 0),
      errorMessage: Value(raw['error_message'] as String?),
      createdAt: DateTime.parse(raw['created_at'] as String),
      rolledBackAt: Value(_date(raw['rolled_back_at'])),
    );

ImportBatchChangesCompanion _batchChangeCompanion(Map raw) =>
    ImportBatchChangesCompanion.insert(
      id: Value(raw['id'] as int),
      batchId: raw['batch_id'] as String,
      entityType: raw['entity_type'] as String,
      entityId: raw['entity_id'] as String,
      operation: raw['operation'] as String,
      beforeJson: Value(raw['before_json'] as String?),
      afterJson: Value(raw['after_json'] as String?),
      createdAt: DateTime.parse(raw['created_at'] as String),
    );

List<SleepRecord> buildSleepRecords(Iterable<LifeEvent> source) {
  final events =
      source
          .where(
            (event) =>
                event.deletedAt == null &&
                (event.kind == 'sleep' || event.kind == 'wake'),
          )
          .toList()
        ..sort((a, b) => a.occurredAt.compareTo(b.occurredAt));
  final records = <SleepRecord>[];
  LifeEvent? pendingSleep;
  for (final event in events) {
    if (event.kind == 'sleep') {
      if (pendingSleep != null) {
        records.add(SleepRecord(start: pendingSleep, issue: '缺少起床记录'));
      }
      pendingSleep = event;
      continue;
    }
    if (pendingSleep == null) {
      records.add(SleepRecord(end: event, issue: '缺少睡觉记录'));
      continue;
    }
    final duration = event.occurredAt.difference(pendingSleep.occurredAt);
    records.add(
      SleepRecord(
        start: pendingSleep,
        end: event,
        issue: duration <= Duration.zero
            ? '时间顺序异常'
            : duration > const Duration(hours: 24)
            ? '睡眠区间超过 24 小时'
            : null,
      ),
    );
    pendingSleep = null;
  }
  if (pendingSleep != null) {
    records.add(SleepRecord(start: pendingSleep, issue: '缺少起床记录'));
  }
  return records.reversed.toList();
}
