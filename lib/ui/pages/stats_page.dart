import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';

class StatsPage extends ConsumerWidget {
  const StatsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(tasksProvider).valueOrNull ?? const <Task>[];
    final focus = ref.watch(focusMinutesProvider).valueOrNull ?? 0;
    final done = tasks.where((item) => item.status == 'done').length;
    final progress = tasks.isEmpty ? 0.0 : done / tasks.length;
    final estimated = tasks.fold(0, (sum, item) => sum + item.estimatedMinutes);
    return PageFrame(
      title: '统计',
      subtitle: '从任务完成与导入专注记录中观察投入结构。',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) => GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: constraints.maxWidth > 900 ? 3 : 1,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 2.25,
              children: [
                MetricCard(
                  label: '任务完成率',
                  value: '${(progress * 100).round()}%',
                  icon: Icons.task_alt,
                  color: ZhixuColors.success,
                ),
                MetricCard(
                  label: '导入专注时长',
                  value: '$focus 分钟',
                  icon: Icons.timer_outlined,
                  color: ZhixuColors.warning,
                ),
                MetricCard(
                  label: '预计工作量',
                  value: '${(estimated / 60).toStringAsFixed(1)} 小时',
                  icon: Icons.schedule_outlined,
                  color: ZhixuColors.accent,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SectionCard(child: _CompletionChart(tasks: tasks)),
        ],
      ),
    );
  }
}

class _CompletionChart extends StatelessWidget {
  const _CompletionChart({required this.tasks});

  final List<Task> tasks;

  @override
  Widget build(BuildContext context) {
    final groups = <String, int>{'待完成': 0, '进行中': 0, '已完成': 0, '受阻': 0};
    for (final task in tasks) {
      final key = switch (task.status) {
        'done' => '已完成',
        'in_progress' => '进行中',
        'blocked' => '受阻',
        _ => '待完成',
      };
      groups[key] = (groups[key] ?? 0) + 1;
    }
    final max = groups.values.fold(1, (a, b) => a > b ? a : b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('任务状态分布', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 22),
        ...groups.entries.map((entry) {
          final color = switch (entry.key) {
            '已完成' => ZhixuColors.success,
            '进行中' => ZhixuColors.accent,
            '受阻' => ZhixuColors.danger,
            _ => ZhixuColors.muted,
          };
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Row(
              children: [
                SizedBox(
                  width: 54,
                  child: Text(
                    entry.key,
                    style: const TextStyle(
                      color: ZhixuColors.muted,
                      fontSize: 12,
                    ),
                  ),
                ),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: entry.value / max,
                      minHeight: 10,
                      color: color,
                      backgroundColor: ZhixuColors.border,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  '${entry.value}',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}
