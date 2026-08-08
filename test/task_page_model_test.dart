import 'package:flutter_test/flutter_test.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/ui/pages/task_page_model.dart';

void main() {
  final now = DateTime(2026, 8, 12, 14);

  test('任务工作台统计使用本地日期和周一周界', () {
    final tasks = [
      _task('overdue', dueAt: DateTime(2026, 8, 11, 23)),
      _task('today', dueAt: DateTime(2026, 8, 12, 18), minutes: 30),
      _task('progress', status: 'in_progress', minutes: 90),
      _task(
        'completed-this-week',
        status: 'done',
        completedAt: DateTime(2026, 8, 10, 9),
        minutes: 45,
      ),
      _task(
        'completed-last-week',
        status: 'done',
        completedAt: DateTime(2026, 8, 9, 22),
      ),
    ];

    final summary = summarizeTaskWorkspace(tasks, now: now);
    expect(summary.total, 5);
    expect(summary.dueToday, 1);
    expect(summary.overdue, 1);
    expect(summary.completedThisWeek, 1);
    expect(summary.inProgress, 1);
    expect(summary.activeEstimatedMinutes, 120);
  });

  test('快速视图覆盖今天明天近七天无日期和已完成', () {
    final today = _task('today', dueAt: DateTime(2026, 8, 12, 23, 59));
    final tomorrow = _task('tomorrow', dueAt: DateTime(2026, 8, 13, 8));
    final upcoming = _task('upcoming', dueAt: DateTime(2026, 8, 19, 23));
    final later = _task('later', dueAt: DateTime(2026, 8, 20));
    final noDate = _task('no-date');
    final done = _task('done', status: 'done');

    expect(matchesTaskQuickView(today, TaskQuickView.today, now: now), isTrue);
    expect(
      matchesTaskQuickView(tomorrow, TaskQuickView.tomorrow, now: now),
      isTrue,
    );
    expect(
      matchesTaskQuickView(upcoming, TaskQuickView.upcoming, now: now),
      isTrue,
    );
    expect(
      matchesTaskQuickView(later, TaskQuickView.upcoming, now: now),
      isFalse,
    );
    expect(
      matchesTaskQuickView(noDate, TaskQuickView.noDate, now: now),
      isTrue,
    );
    expect(matchesTaskQuickView(done, TaskQuickView.done, now: now), isTrue);
  });

  test('任务分组覆盖跨日边界并将完成任务独立归组', () {
    final tasks = [
      _task('overdue', dueAt: DateTime(2026, 8, 11, 23, 59)),
      _task('today', dueAt: DateTime(2026, 8, 12)),
      _task('tomorrow', dueAt: DateTime(2026, 8, 13)),
      _task('upcoming', dueAt: DateTime(2026, 8, 19, 23, 59)),
      _task('later', dueAt: DateTime(2026, 8, 20)),
      _task('no-date'),
      _task('done', status: 'done', dueAt: DateTime(2026, 8, 12)),
    ];

    final groups = groupTasksByDate(
      tasks,
      now: now,
      compare: (a, b) => a.title.compareTo(b.title),
    );
    expect(groups.map((group) => group.kind), TaskDateGroupKind.values);
    expect(groups.last.tasks.single.title, 'done');
  });
}

Task _task(
  String title, {
  String status = 'todo',
  DateTime? dueAt,
  DateTime? completedAt,
  int minutes = 0,
}) => Task(
  id: title,
  title: title,
  status: status,
  priority: 1,
  dueAt: dueAt,
  estimatedMinutes: minutes,
  completedAt: completedAt,
  isArchived: false,
  createdAt: DateTime(2026, 8, 1),
  updatedAt: DateTime(2026, 8, 1),
  deviceId: 'test',
  serverRevision: 0,
);
