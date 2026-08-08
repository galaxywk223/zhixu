import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';
import 'package:zhixu/core/legacy_text.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/data/repository.dart';
import 'package:zhixu/services/sync_service.dart';

void main() {
  late ZhixuDatabase database;
  late ZhixuRepository repository;

  setUp(() {
    database = ZhixuDatabase.memory();
    repository = ZhixuRepository(database, deviceId: 'test-device');
  });

  tearDown(() async {
    await database.close();
  });

  test('任务创建与状态更新写入本地数据库和 outbox', () async {
    final taskId = await repository.createTask(
      const TaskDraft(title: '完成知序验收', estimatedMinutes: 30),
    );
    expect(
      (await database.select(database.tasks).get()).single.title,
      '完成知序验收',
    );
    expect((await repository.pendingOutbox()).single.entityId, taskId);

    await repository.setTaskStatus(taskId, 'done');
    expect((await database.select(database.tasks).get()).single.status, 'done');
  });

  test('番茄导入只写专注和生活事件、重复导入去重并支持整批撤销', () async {
    final sessions = [
      ImportedFocusSession(
        sourceKey: 'canonical-focus',
        startAt: DateTime(2026, 8, 7, 12, 49),
        endAt: DateTime(2026, 8, 7, 13, 2),
        taskName: 'vibe coding',
        durationMinutes: 13,
        status: '已完成',
      ),
      ImportedFocusSession(
        sourceKey: 'canonical-wake',
        legacySourceKey: 'legacy-wake',
        startAt: DateTime(2026, 8, 7, 10, 30),
        endAt: DateTime(2026, 8, 7, 10, 30),
        taskName: '起床',
        durationMinutes: 0,
        status: '已完成',
      ),
    ];

    final first = await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'hash-1',
      sessions: sessions,
      declaredMinutes: 13,
      declaredRecords: 2,
    );
    expect(first.importedCount, 2);
    expect(first.focusImportedCount, 1);
    expect(first.lifeEventImportedCount, 1);
    expect(first.tasksCreatedCount, 0);
    expect(await repository.focusMinutes(), 13);
    expect(await database.select(database.tasks).get(), isEmpty);
    expect(
      (await database.select(database.focusSessions).get()).single.linkedTaskId,
      isNull,
    );
    final event = (await database.select(database.lifeEvents).get()).single;
    expect(event.title, '起床');
    expect(event.kind, 'wake');

    final second = await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'hash-1',
      sessions: sessions,
    );
    expect(second.importedCount, 0);
    expect(second.updatedCount, 0);
    expect(second.skippedCount, 2);
    expect(await repository.focusMinutes(), 13);

    await repository.rollbackImportBatch(first.batchId);
    expect(await repository.focusMinutes(), 0);
    expect(await repository.watchTasks().first, isEmpty);
    expect(await repository.watchLifeEvents().first, isEmpty);
    final batch = await (database.select(
      database.importBatches,
    )..where((row) => row.id.equals(first.batchId))).getSingle();
    expect(batch.rolledBackAt, isNotNull);
  });

  test('导入复用人工任务且不覆盖人工状态', () async {
    await repository.createTask(const TaskDraft(title: '阅读'));
    final original = (await database.select(database.tasks).get()).single;

    final result = await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'hash-2',
      sessions: [
        ImportedFocusSession(
          sourceKey: 'reading-session',
          startAt: DateTime(2026, 8, 7, 9),
          endAt: DateTime(2026, 8, 7, 9, 25),
          taskName: '  阅读  ',
          durationMinutes: 25,
          status: '已完成',
        ),
      ],
    );

    expect(result.tasksCreatedCount, 0);
    final tasks = await database.select(database.tasks).get();
    expect(tasks, hasLength(1));
    expect(tasks.single.id, original.id);
    expect(tasks.single.status, 'todo');
  });

  test('累计导出按时间去重、覆盖专注事项改名并可撤销', () async {
    final sharedStart = DateTime(2026, 8, 7, 12, 49);
    final sharedEnd = DateTime(2026, 8, 7, 13, 2);
    final oldBatch = await repository.importFocusSessions(
      fileName: 'old.xls',
      fileHash: 'old-hash',
      sessions: [
        ImportedFocusSession(
          sourceKey: 'old-name-key',
          startAt: sharedStart,
          endAt: sharedEnd,
          taskName: 'vibe coding',
          durationMinutes: 13,
          status: '已完成',
        ),
      ],
    );
    final oldCategory = (await repository.watchTaskCategories().first).single;
    final manualTaskId = await repository.createTask(
      TaskDraft(
        title: '开发知序分类功能',
        categoryId: oldCategory.id,
        estimatedMinutes: 120,
      ),
    );

    final sessions = [
      ImportedFocusSession(
        sourceKey: tomatoSourceKey(sharedStart, sharedEnd),
        legacySourceKey: 'renamed-legacy-key',
        startAt: sharedStart,
        endAt: sharedEnd,
        taskName: '项目开发',
        durationMinutes: 13,
        status: '已完成',
      ),
      ImportedFocusSession(
        sourceKey: tomatoSourceKey(
          DateTime(2026, 8, 7, 13, 5),
          DateTime(2026, 8, 7, 13, 7),
        ),
        startAt: DateTime(2026, 8, 7, 13, 5),
        endAt: DateTime(2026, 8, 7, 13, 7),
        taskName: '项目开发',
        durationMinutes: 2,
        status: '已完成',
      ),
      ...[
        (13, 31, 15, 26, 115, '已完成'),
        (16, 48, 16, 54, 6, '中途放弃'),
        (17, 12, 17, 45, 33, '已完成'),
        (19, 6, 20, 54, 108, '已完成'),
      ].map((row) {
        final start = DateTime(2026, 8, 7, row.$1, row.$2);
        final end = DateTime(2026, 8, 7, row.$3, row.$4);
        return ImportedFocusSession(
          sourceKey: tomatoSourceKey(start, end),
          startAt: start,
          endAt: end,
          taskName: '保研机试复习',
          durationMinutes: row.$5,
          status: row.$6,
        );
      }),
      ImportedFocusSession(
        sourceKey: tomatoSourceKey(
          DateTime(2026, 8, 7, 10, 30),
          DateTime(2026, 8, 7, 10, 30),
        ),
        startAt: DateTime(2026, 8, 7, 10, 30),
        endAt: DateTime(2026, 8, 7, 10, 30),
        taskName: '起床',
        durationMinutes: 0,
        status: '已完成',
      ),
    ];

    final renamedBatch = await repository.importFocusSessions(
      fileName: 'new.xls',
      fileHash: 'new-hash',
      sessions: sessions,
    );
    expect(await repository.focusMinutes(), 277);
    expect(await repository.watchFocusSessions().first, hasLength(6));
    expect(await repository.watchLifeEvents().first, hasLength(1));
    final migratedTask = (await repository.watchTasks().first).single;
    expect(migratedTask.id, manualTaskId);
    expect(migratedTask.title, '开发知序分类功能');
    final renamedCategories = await repository.watchTaskCategories().first;
    expect(
      renamedCategories
          .singleWhere((item) => item.id == migratedTask.categoryId)
          .name,
      '项目开发',
    );
    expect(renamedCategories.any((item) => item.name == '保研机试复习'), isTrue);
    expect(renamedCategories.any((item) => item.name == '起床'), isFalse);
    final renamed = (await repository.watchFocusSessions().first).singleWhere(
      (row) => row.taskName == '项目开发' && row.durationMinutes == 13,
    );
    expect(renamed.taskName, '项目开发');
    expect(renamed.linkedTaskId, isNull);

    final repeated = await repository.importFocusSessions(
      fileName: 'new.xls',
      fileHash: 'new-hash',
      sessions: sessions,
    );
    expect(repeated.importedCount, 0);
    expect(repeated.updatedCount, 0);
    expect(repeated.skippedCount, 7);
    expect(await repository.focusMinutes(), 277);

    await repository.rollbackImportBatch(renamedBatch.batchId);
    expect(await repository.focusMinutes(), 13);
    final restoredTask = (await repository.watchTasks().first).single;
    expect(restoredTask.title, '开发知序分类功能');
    expect(
      (await repository.watchTaskCategories().first)
          .singleWhere((item) => item.id == restoredTask.categoryId)
          .name,
      'vibe coding',
    );
    expect(oldBatch.batchId, isNotEmpty);
  });

  test('任务支持多标签、标签改名删除和 v5 备份数据', () async {
    final studyTag = await repository.createTag('学习', '#175CD3');
    final urgentTag = await repository.createTag('紧急', '#B42318');
    final taskId = await repository.createTask(
      TaskDraft(
        title: '完成机试复习',
        tagIds: {studyTag, urgentTag},
        estimatedMinutes: 90,
        dueAt: DateTime(2026, 8, 9, 18),
      ),
    );
    expect(await repository.tagIdsForTask(taskId), {studyTag, urgentTag});

    await repository.updateTag(studyTag, '课程学习', '#067647');
    expect(
      (await repository.watchTags().first)
          .singleWhere((item) => item.id == studyTag)
          .name,
      '课程学习',
    );
    await repository.deleteTag(urgentTag);
    expect(await repository.tagIdsForTask(taskId), {studyTag});

    final payload = await repository.exportPayload();
    expect(payload['schema_version'], 5);
    expect(payload['tags'], hasLength(2));
    expect(payload['tag_links'], hasLength(2));
    expect((payload['tasks'] as List).single['estimated_minutes'], 90);
  });

  test('v1 至 v5 备份恢复保留任务并按版本恢复分类标签', () async {
    final imported = await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'backup-category',
      sessions: [
        ImportedFocusSession(
          sourceKey: 'backup-focus',
          startAt: DateTime(2026, 8, 8, 9),
          endAt: DateTime(2026, 8, 8, 10),
          taskName: '项目开发',
          durationMinutes: 60,
          status: '已完成',
        ),
      ],
    );
    expect(imported.focusImportedCount, 1);
    final category = (await repository.taskCategories()).single;
    final tagId = await repository.createTag('重要', '#B42318');
    await repository.createTask(
      TaskDraft(
        title: '备份兼容任务',
        categoryId: category.id,
        tagIds: {tagId},
        estimatedMinutes: 45,
        dueAt: DateTime.utc(2026, 8, 10, 12),
      ),
    );
    final current = await repository.exportPayload();

    for (var version = 1; version <= 5; version++) {
      final payload = Map<String, dynamic>.from(current)
        ..['schema_version'] = version;
      if (version < 5) {
        payload.remove('task_categories');
        payload.remove('tags');
        payload.remove('tag_links');
        payload['tasks'] = (payload['tasks'] as List)
            .map(
              (raw) =>
                  Map<String, dynamic>.from(raw as Map)..remove('category_id'),
            )
            .toList();
      }

      await repository.restorePayload(payload);
      final restored = (await repository.watchTasks().first).single;
      expect(restored.title, '备份兼容任务', reason: 'schema v$version');
      expect(restored.estimatedMinutes, 45, reason: 'schema v$version');
      if (version == 5) {
        expect(restored.categoryId, category.id);
        expect(await repository.tagIdsForTask(restored.id), {tagId});
      } else {
        expect(restored.categoryId, isNull);
        expect(await repository.tagIdsForTask(restored.id), isEmpty);
      }
    }
  });

  test('全局搜索匹配任务分类和标签名称', () async {
    await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'search-category',
      sessions: [
        ImportedFocusSession(
          sourceKey: 'search-focus',
          startAt: DateTime(2026, 8, 8, 9),
          endAt: DateTime(2026, 8, 8, 10),
          taskName: '项目开发',
          durationMinutes: 60,
          status: '已完成',
        ),
      ],
    );
    final category = (await repository.taskCategories()).single;
    final tagId = await repository.createTag('客户端', '#175CD3');
    await repository.createTask(
      TaskDraft(title: '实现详情面板', categoryId: category.id, tagIds: {tagId}),
    );

    expect(
      (await repository.search(
        '项目开发',
      )).singleWhere((hit) => hit.entityType == 'task').title,
      '实现详情面板',
    );
    expect(
      (await repository.search(
        '客户端',
      )).singleWhere((hit) => hit.entityType == 'task').title,
      '实现详情面板',
    );
  });

  test('同步顺序和分类标签任务关联 payload 保持依赖契约', () async {
    expect(syncEntityPullOrder.take(4), [
      'task_category',
      'tag',
      'task',
      'tag_link',
    ]);
    expect(syncTableName('task_category'), 'task_categories');
    expect(syncTableName('tag_link'), 'tag_links');

    await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'sync-category',
      sessions: [
        ImportedFocusSession(
          sourceKey: 'sync-focus',
          startAt: DateTime(2026, 8, 8, 9),
          endAt: DateTime(2026, 8, 8, 10),
          taskName: '项目开发',
          durationMinutes: 60,
          status: '已完成',
        ),
      ],
    );
    final category = (await repository.taskCategories()).single;
    final tagId = await repository.createTag('同步标签', '#067647');
    final taskId = await repository.createTask(
      TaskDraft(title: '同步任务', categoryId: category.id, tagIds: {tagId}),
    );
    final link = (await repository.watchTaskTagLinks().first).single;

    expect(
      (await repository.taskCategoryPayload(category.id))?['name'],
      '项目开发',
    );
    expect((await repository.tagPayload(tagId))?['normalized_name'], '同步标签');
    expect((await repository.taskPayload(taskId))?['category_id'], category.id);
    final linkPayload = await repository.tagLinkPayload(link.id);
    expect(linkPayload?['tag_id'], tagId);
    expect(linkPayload?['entity_id'], taskId);
  });

  test('旧乱码记录可迁移为规范专注和生活事件且迁移幂等', () async {
    final now = DateTime.utc(2026, 8, 7, 13);
    await database
        .into(database.focusSessions)
        .insert(
          FocusSessionsCompanion.insert(
            id: 'legacy-focus',
            sourceKey: 'legacy-focus-key',
            startAt: DateTime(2026, 8, 7, 12, 49),
            endAt: DateTime(2026, 8, 7, 13, 2),
            taskName: 'vibe coding',
            durationMinutes: 13,
            status: 'ò]Œ[\u0010b',
            createdAt: now,
            updatedAt: now,
            deviceId: 'old-device',
          ),
        );
    await database
        .into(database.focusSessions)
        .insert(
          FocusSessionsCompanion.insert(
            id: 'legacy-wake',
            sourceKey: 'legacy-wake-key',
            startAt: DateTime(2026, 8, 7, 10, 30),
            endAt: DateTime(2026, 8, 7, 10, 30),
            taskName: 'w\u008dŠ^',
            durationMinutes: 0,
            status: 'ò]Œ[\u0010b',
            createdAt: now,
            updatedAt: now,
            deviceId: 'old-device',
          ),
        );

    await repository.reconcileLegacyTomatoData();
    await repository.reconcileLegacyTomatoData();

    final focus = await (database.select(
      database.focusSessions,
    )..where((row) => row.deletedAt.isNull())).get();
    expect(focus, hasLength(1));
    expect(focus.single.status, '已完成');
    expect(focus.single.linkedTaskId, isNull);
    final events = await database.select(database.lifeEvents).get();
    expect(events, hasLength(1));
    expect(events.single.title, '起床');
    expect(events.single.kind, 'wake');
    expect(await database.select(database.tasks).get(), isEmpty);
  });

  test('睡眠配对覆盖跨日、午睡、孤立事件和超长异常', () async {
    Future<void> add(String id, String kind, DateTime time) => database
        .into(database.lifeEvents)
        .insert(
          LifeEventsCompanion.insert(
            id: id,
            sourceKey: id,
            source: const Value('manual'),
            kind: Value(kind),
            title: kind == 'sleep' ? '睡觉' : '起床',
            occurredAt: time,
            createdAt: time,
            updatedAt: time,
            deviceId: 'test-device',
          ),
        );

    await add('orphan-wake', 'wake', DateTime.utc(2026, 8, 1, 8));
    await add('night-sleep', 'sleep', DateTime.utc(2026, 8, 1, 23));
    await add('night-wake', 'wake', DateTime.utc(2026, 8, 2, 7));
    await add('nap-sleep', 'sleep', DateTime.utc(2026, 8, 2, 13));
    await add('nap-wake', 'wake', DateTime.utc(2026, 8, 2, 14));
    await add('long-sleep', 'sleep', DateTime.utc(2026, 8, 3, 1));
    await add('long-wake', 'wake', DateTime.utc(2026, 8, 4, 2));

    final records = buildSleepRecords(
      await database.select(database.lifeEvents).get(),
    );
    expect(records.where((record) => record.isValid), hasLength(2));
    expect(records.any((record) => record.issue == '缺少睡觉记录'), isTrue);
    expect(records.any((record) => record.issue == '睡眠区间超过 24 小时'), isTrue);
  });
}
