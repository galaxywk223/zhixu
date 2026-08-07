import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/data/repository.dart';

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

  test('旧项目类型均可作为专题读取', () async {
    await repository.createProject(
      const ProjectDraft(name: '普通记录', kind: 'project'),
    );
    await repository.createProject(
      const ProjectDraft(name: '学习记录', kind: 'learning_plan'),
    );

    final projects = await repository.watchProjects().first;
    expect(
      projects.map((project) => project.name),
      containsAll(['普通记录', '学习记录']),
    );
    expect(
      projects.map((project) => project.kind),
      containsAll(['project', 'learning_plan']),
    );
  });

  test('番茄导入创建任务和生活事件、重复导入去重并支持整批撤销', () async {
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
    expect(first.tasksCreatedCount, 1);
    expect(await repository.focusMinutes(), 13);
    final task = (await database.select(database.tasks).get()).single;
    expect(task.title, 'vibe coding');
    expect(task.status, 'done');
    expect(
      (await database.select(database.focusSessions).get()).single.linkedTaskId,
      task.id,
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

  test('旧乱码记录可迁移为规范任务和生活事件且迁移幂等', () async {
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
    expect(focus.single.linkedTaskId, isNotNull);
    final events = await database.select(database.lifeEvents).get();
    expect(events, hasLength(1));
    expect(events.single.title, '起床');
    expect(events.single.kind, 'wake');
    expect(await database.select(database.tasks).get(), hasLength(1));
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
