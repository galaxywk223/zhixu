import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';

class TodayPage extends ConsumerWidget {
  const TodayPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(todayTasksProvider);
    final allTasks = ref.watch(tasksProvider).valueOrNull ?? const <Task>[];
    final focus = ref.watch(todayFocusMinutesProvider).valueOrNull ?? 0;
    final done = allTasks.where((item) => item.status == 'done').length;
    final todayDone = (tasks.valueOrNull ?? const <Task>[])
        .where((item) => item.status == 'done')
        .length;
    final todayTotal = tasks.valueOrNull?.length ?? 0;
    final date = DateTime.now();
    final hour = date.hour;
    final greeting = hour < 12
        ? '早上好 ☀️'
        : hour < 18
            ? '下午好 ☕'
            : '晚上好 🌙';

    return PageFrame(
      title: '$greeting · ${DateFormat('M月d日 EEEE', 'zh_CN').format(date)}',
      subtitle: '查看今天的手动待办、截止安排和独立专注统计。',
      actions: [
        FilledButton.icon(
          onPressed: () => showTaskEditor(context, ref),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('添加任务'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              final count = constraints.maxWidth > 1150 ? 4 : 2;
              return GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: count,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 2.35,
                children: [
                  MetricCard(
                    label: '今日任务完成度',
                    value: '$todayDone / $todayTotal',
                    icon: Icons.check_circle_outline,
                    color: ZhixuColors.accent,
                  ),
                  MetricCard(
                    label: '累计已完成任务',
                    value: '$done',
                    icon: Icons.task_alt,
                    color: ZhixuColors.success,
                  ),
                  MetricCard(
                    label: '今日专注时长',
                    value: '$focus 分钟',
                    icon: Icons.timer_outlined,
                    color: ZhixuColors.warning,
                  ),
                  MetricCard(
                    label: '待处理总量',
                    value:
                        '${allTasks.where((item) => item.status != 'done').length}',
                    icon: Icons.inbox_outlined,
                    color: ZhixuColors.purple,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth > 1000;
              final left = SectionCard(
                child: _TodayTaskList(
                  tasks: tasks.valueOrNull ?? const <Task>[],
                ),
              );
              final right = Column(
                children: [
                  SectionCard(
                    child: _ProgressCard(
                      done: todayDone,
                      total: todayTotal,
                      focus: focus,
                    ),
                  ),
                  const SizedBox(height: 14),
                  SectionCard(
                    child: _Upcoming(
                      tasks: allTasks
                          .where(
                            (item) =>
                                item.dueAt != null && item.status != 'done',
                          )
                          .take(5)
                          .toList(),
                    ),
                  ),
                ],
              );
              return wide
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(flex: 3, child: left),
                        const SizedBox(width: 16),
                        Expanded(flex: 2, child: right),
                      ],
                    )
                  : Column(children: [left, const SizedBox(height: 16), right]);
            },
          ),
        ],
      ),
    );
  }
}
class _TodayTaskList extends ConsumerWidget {
  const _TodayTaskList({required this.tasks});

  final List<Task> tasks;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories =
        ref.watch(taskCategoriesProvider).valueOrNull ?? const <TaskCategory>[];
    final tags = ref.watch(tagsProvider).valueOrNull ?? const <Tag>[];
    final links =
        ref.watch(taskTagLinksProvider).valueOrNull ?? const <TagLink>[];
    final categoryById = {for (final item in categories) item.id: item};
    final tagById = {for (final item in tags) item.id: item};
    final tagIdsByTask = <String, Set<String>>{};
    for (final link in links) {
      tagIdsByTask.putIfAbsent(link.entityId, () => {}).add(link.tagId);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('今日待办', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: ZhixuColors.accent.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${tasks.length}',
                style: const TextStyle(
                  color: ZhixuColors.accent,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const Spacer(),
            TextButton.icon(
              onPressed: () => showTaskEditor(context, ref),
              icon: const Icon(Icons.add, size: 17),
              label: const Text('添加'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (tasks.isEmpty)
          const EmptyState(
            icon: Icons.wb_sunny_outlined,
            title: '今天还没有安排',
            message: '添加一项最重要的任务，开始今天的节奏。',
          )
        else
          ...tasks.map(
            (task) => TaskTile(
              task: task,
              category: categoryById[task.categoryId],
              tags: (tagIdsByTask[task.id] ?? const <String>{})
                  .map((id) => tagById[id])
                  .whereType<Tag>()
                  .toList(),
              onEdit: () => showTaskEditor(context, ref, task: task),
              onToggle: () async {
                await ref
                    .read(repositoryProvider)
                    .setTaskStatus(
                      task.id,
                      task.status == 'done' ? 'todo' : 'done',
                    );
                refreshCore(ref);
              },
              onDelete: () async {
                await ref.read(repositoryProvider).deleteTask(task.id);
                refreshCore(ref);
              },
            ),
          ),
      ],
    );
  }
}

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({
    required this.done,
    required this.total,
    required this.focus,
  });

  final int done;
  final int total;
  final int focus;

  @override
  Widget build(BuildContext context) {
    final progress = total == 0 ? 0.0 : done / total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('今日进度概览', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 20),
        Row(
          children: [
            SizedBox(
              width: 92,
              height: 92,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CircularProgressIndicator(
                    value: progress,
                    strokeWidth: 8,
                    backgroundColor: ZhixuColors.muted.withValues(alpha: 0.15),
                    color: ZhixuColors.accent,
                  ),
                  Text(
                    '${(progress * 100).round()}%',
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$done / $total 完成',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(Icons.timer_outlined, size: 14, color: ZhixuColors.warning),
                      const SizedBox(width: 4),
                      Text(
                        '今日专注 $focus 分钟',
                        style: const TextStyle(color: ZhixuColors.muted, fontSize: 13),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 7,
                      backgroundColor: ZhixuColors.muted.withValues(alpha: 0.15),
                      color: ZhixuColors.accent,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Upcoming extends StatelessWidget {
  const _Upcoming({required this.tasks});

  final List<Task> tasks;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('即将到期', style: Theme.of(context).textTheme.titleLarge),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: ZhixuColors.danger.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '${tasks.length}',
                style: const TextStyle(
                  color: ZhixuColors.danger,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (tasks.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Text('暂无即将到期任务', style: TextStyle(color: ZhixuColors.muted, fontSize: 13.5)),
          )
        else
          ...tasks.map(
            (task) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: ZhixuColors.danger.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: ZhixuColors.danger.withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: ZhixuColors.danger,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(color: ZhixuColors.danger, blurRadius: 4),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      task.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                  ),
                  Text(
                    DateFormat('M/d HH:mm').format(task.dueAt!.toLocal()),
                    style: const TextStyle(
                      color: ZhixuColors.muted,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
