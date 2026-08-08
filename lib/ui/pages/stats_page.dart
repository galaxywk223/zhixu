import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';

class StatsPage extends ConsumerWidget {
  const StatsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(tasksProvider).valueOrNull ?? const <Task>[];
    final sessions =
        ref.watch(focusSessionsProvider).valueOrNull ?? const <FocusSession>[];
    final done = tasks.where((item) => item.status == 'done').length;
    final progress = tasks.isEmpty ? 0.0 : done / tasks.length;
    final estimated = tasks.fold(0, (sum, item) => sum + item.estimatedMinutes);
    final focus = sessions.fold(0, (sum, item) => sum + item.durationMinutes);
    return PageFrame(
      title: '统计',
      subtitle: '任务完成情况与专注投入分开统计，避免混淆两种业务口径。',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) => GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: constraints.maxWidth > 900 ? 3 : 1,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: constraints.maxWidth > 900 ? 2.5 : 4.5,
              children: [
                MetricCard(
                  label: '任务完成率',
                  value: '${(progress * 100).round()}%',
                  icon: Icons.task_alt_outlined,
                  color: ZhixuColors.success,
                ),
                MetricCard(
                  label: '专注累计',
                  value: '$focus 分钟',
                  icon: Icons.timer_outlined,
                  color: ZhixuColors.warning,
                ),
                MetricCard(
                  label: '待办预计工作量',
                  value: '${(estimated / 60).toStringAsFixed(1)} 小时',
                  icon: Icons.schedule_outlined,
                  color: ZhixuColors.accent,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final taskPanel = SectionCard(
                child: _CompletionChart(tasks: tasks),
              );
              final focusPanel = SectionCard(
                child: _FocusTrend(sessions: sessions),
              );
              if (constraints.maxWidth > 960) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: taskPanel),
                    const SizedBox(width: 16),
                    Expanded(child: focusPanel),
                  ],
                );
              }
              return Column(
                children: [taskPanel, const SizedBox(height: 16), focusPanel],
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
        Text('任务状态', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        Text('仅统计手动创建的待办', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 22),
        ...groups.entries.map((entry) {
          final color = switch (entry.key) {
            '已完成' => ZhixuColors.success,
            '进行中' => ZhixuColors.accent,
            '受阻' => ZhixuColors.danger,
            _ => ZhixuColors.muted,
          };
          return _BarRow(
            label: entry.key,
            value: entry.value,
            fraction: entry.value / max,
            color: color,
          );
        }),
      ],
    );
  }
}

class _FocusTrend extends StatelessWidget {
  const _FocusTrend({required this.sessions});

  final List<FocusSession> sessions;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final days = List.generate(7, (index) {
      final day = DateUtils.dateOnly(now.subtract(Duration(days: 6 - index)));
      final minutes = sessions
          .where((row) => DateUtils.isSameDay(row.startAt.toLocal(), day))
          .fold(0, (sum, row) => sum + row.durationMinutes);
      return (day, minutes);
    });
    final max = days.map((row) => row.$2).fold(1, (a, b) => a > b ? a : b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('近 7 天专注', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        Text('按番茄记录的开始日期汇总', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 22),
        ...days.map(
          (row) => _BarRow(
            label: DateFormat('E', 'zh_CN').format(row.$1),
            value: row.$2,
            suffix: '分钟',
            fraction: row.$2 / max,
            color: ZhixuColors.warning,
          ),
        ),
      ],
    );
  }
}

class _BarRow extends StatelessWidget {
  const _BarRow({
    required this.label,
    required this.value,
    required this.fraction,
    required this.color,
    this.suffix = '',
  });

  final String label;
  final int value;
  final double fraction;
  final Color color;
  final String suffix;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 15),
    child: Row(
      children: [
        SizedBox(
          width: 64,
          child: Text(label, style: Theme.of(context).textTheme.bodySmall),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 9,
              color: color,
              backgroundColor: Theme.of(
                context,
              ).colorScheme.surfaceContainerHighest,
            ),
          ),
        ),
        const SizedBox(width: 12),
        SizedBox(
          width: 68,
          child: Text(
            '$value${suffix.isEmpty ? '' : ' $suffix'}',
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}
