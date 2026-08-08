import '../../data/database.dart';

enum TaskQuickView { active, all, today, tomorrow, upcoming, noDate, done }

enum TaskDateGroupKind {
  overdue,
  today,
  tomorrow,
  upcoming,
  later,
  noDate,
  completed,
}

class TaskWorkspaceSummary {
  const TaskWorkspaceSummary({
    required this.total,
    required this.dueToday,
    required this.overdue,
    required this.completedThisWeek,
    required this.inProgress,
    required this.activeEstimatedMinutes,
  });

  final int total;
  final int dueToday;
  final int overdue;
  final int completedThisWeek;
  final int inProgress;
  final int activeEstimatedMinutes;
}

class TaskDateGroup {
  const TaskDateGroup(this.kind, this.tasks);

  final TaskDateGroupKind kind;
  final List<Task> tasks;
}

TaskWorkspaceSummary summarizeTaskWorkspace(
  Iterable<Task> tasks, {
  required DateTime now,
}) {
  final list = tasks.toList();
  final today = startOfLocalDay(now);
  final tomorrow = today.add(const Duration(days: 1));
  final weekStart = today.subtract(Duration(days: today.weekday - 1));
  final weekEnd = weekStart.add(const Duration(days: 7));
  final active = list.where((task) => task.status != 'done').toList();
  return TaskWorkspaceSummary(
    total: list.length,
    dueToday: active.where((task) {
      final due = task.dueAt?.toLocal();
      return due != null && !due.isBefore(today) && due.isBefore(tomorrow);
    }).length,
    overdue: active.where((task) {
      final due = task.dueAt?.toLocal();
      return due != null && due.isBefore(today);
    }).length,
    completedThisWeek: list.where((task) {
      final completed = task.completedAt?.toLocal();
      return task.status == 'done' &&
          completed != null &&
          !completed.isBefore(weekStart) &&
          completed.isBefore(weekEnd);
    }).length,
    inProgress: list.where((task) => task.status == 'in_progress').length,
    activeEstimatedMinutes: active.fold(
      0,
      (sum, task) => sum + task.estimatedMinutes,
    ),
  );
}

bool matchesTaskQuickView(
  Task task,
  TaskQuickView view, {
  required DateTime now,
}) {
  final today = startOfLocalDay(now);
  final tomorrow = today.add(const Duration(days: 1));
  final afterTomorrow = today.add(const Duration(days: 2));
  final upcomingEnd = today.add(const Duration(days: 8));
  final due = task.dueAt?.toLocal();
  return switch (view) {
    TaskQuickView.active => task.status != 'done',
    TaskQuickView.all => true,
    TaskQuickView.today =>
      due != null && !due.isBefore(today) && due.isBefore(tomorrow),
    TaskQuickView.tomorrow =>
      due != null && !due.isBefore(tomorrow) && due.isBefore(afterTomorrow),
    TaskQuickView.upcoming =>
      due != null && !due.isBefore(afterTomorrow) && due.isBefore(upcomingEnd),
    TaskQuickView.noDate => due == null,
    TaskQuickView.done => task.status == 'done',
  };
}

List<TaskDateGroup> groupTasksByDate(
  Iterable<Task> tasks, {
  required DateTime now,
  required Comparator<Task> compare,
}) {
  final today = startOfLocalDay(now);
  final tomorrow = today.add(const Duration(days: 1));
  final afterTomorrow = today.add(const Duration(days: 2));
  final upcomingEnd = today.add(const Duration(days: 8));
  final grouped = {for (final kind in TaskDateGroupKind.values) kind: <Task>[]};
  for (final task in tasks) {
    if (task.status == 'done') {
      grouped[TaskDateGroupKind.completed]!.add(task);
      continue;
    }
    final due = task.dueAt?.toLocal();
    final kind = due == null
        ? TaskDateGroupKind.noDate
        : due.isBefore(today)
        ? TaskDateGroupKind.overdue
        : due.isBefore(tomorrow)
        ? TaskDateGroupKind.today
        : due.isBefore(afterTomorrow)
        ? TaskDateGroupKind.tomorrow
        : due.isBefore(upcomingEnd)
        ? TaskDateGroupKind.upcoming
        : TaskDateGroupKind.later;
    grouped[kind]!.add(task);
  }
  return [
    for (final kind in TaskDateGroupKind.values)
      if (grouped[kind]!.isNotEmpty)
        TaskDateGroup(kind, grouped[kind]!..sort(compare)),
  ];
}

DateTime startOfLocalDay(DateTime value) {
  final local = value.toLocal();
  return DateTime(local.year, local.month, local.day);
}
