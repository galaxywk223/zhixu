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
    final projects =
        ref.watch(projectsProvider).valueOrNull ?? const <Project>[];
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
              crossAxisCount: constraints.maxWidth > 1100 ? 4 : 2,
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
                MetricCard(
                  label: '活跃专题',
                  value: '${projects.length}',
                  icon: Icons.folder_open_outlined,
                  color: ZhixuColors.purple,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final completion = SectionCard(
                child: _CompletionChart(tasks: tasks),
              );
              final project = SectionCard(
                child: _ProjectProgress(tasks: tasks, projects: projects),
              );
              if (constraints.maxWidth > 1000) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: completion),
                    const SizedBox(width: 14),
                    Expanded(child: project),
                  ],
                );
              }
              return Column(
                children: [completion, const SizedBox(height: 14), project],
              );
            },
          ),
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

class _ProjectProgress extends StatelessWidget {
  const _ProjectProgress({required this.tasks, required this.projects});

  final List<Task> tasks;
  final List<Project> projects;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text('专题进度', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 16),
      if (projects.isEmpty)
        const Text('暂无专题数据', style: TextStyle(color: ZhixuColors.muted))
      else
        ...projects.map((project) {
          final related = tasks
              .where((task) => task.projectId == project.id)
              .toList();
          final done = related.where((task) => task.status == 'done').length;
          final value = related.isEmpty ? 0.0 : done / related.length;
          return Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        project.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      '$done / ${related.length}',
                      style: const TextStyle(
                        color: ZhixuColors.muted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 7),
                LinearProgressIndicator(
                  value: value,
                  minHeight: 7,
                  borderRadius: BorderRadius.circular(4),
                  color: ZhixuColors.accent,
                ),
              ],
            ),
          );
        }),
    ],
  );
}
