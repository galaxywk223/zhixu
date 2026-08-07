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

  test('番茄导入按 sourceKey 去重、统计有效时长并支持整批撤销', () async {
    final sessions = [
      ImportedFocusSession(
        sourceKey: 'tomatodo|2026-08-07T09:00:00|2026-08-07T09:10:00|阅读',
        startAt: DateTime(2026, 8, 7, 9),
        endAt: DateTime(2026, 8, 7, 9, 10),
        taskName: '阅读',
        durationMinutes: 10,
        status: 'completed',
        completionPercent: 100,
      ),
      ImportedFocusSession(
        sourceKey: 'tomatodo|2026-08-07T10:00:00|2026-08-07T10:03:00|复盘',
        startAt: DateTime(2026, 8, 7, 10),
        endAt: DateTime(2026, 8, 7, 10, 3),
        taskName: '复盘',
        durationMinutes: 3,
        status: 'completed',
        completionPercent: 100,
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
    expect(await repository.focusMinutes(), 13);

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
    final batch = await (database.select(
      database.importBatches,
    )..where((row) => row.id.equals(first.batchId))).getSingle();
    expect(batch.rolledBackAt, isNotNull);
  });
}
