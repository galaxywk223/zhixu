import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';

class TasksPage extends ConsumerStatefulWidget {
  const TasksPage({super.key});

  @override
  ConsumerState<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends ConsumerState<TasksPage> {
  String filter = 'active';
  String query = '';

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(tasksProvider).valueOrNull ?? const <Task>[];
    final visible = tasks.where((task) {
      final matchesFilter =
          filter == 'all' ||
          (filter == 'active' ? task.status != 'done' : task.status == filter);
      final matchesQuery =
          query.trim().isEmpty ||
          task.title.toLowerCase().contains(query.toLowerCase());
      return matchesFilter && matchesQuery;
    }).toList();
    return PageFrame(
      title: '任务管理',
      subtitle: '集中查看、分类整理、快速推进所有任务。',
      actions: [
        SizedBox(
          width: 250,
          child: TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search, size: 19),
              hintText: '搜索任务...',
            ),
            onChanged: (value) => setState(() => query = value),
          ),
        ),
        const SizedBox(width: 10),
        FilledButton.icon(
          onPressed: () => showTaskEditor(context, ref),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('添加任务'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _FilterButton(
                label: '待处理',
                count: tasks.where((item) => item.status != 'done').length,
                active: filter == 'active',
                onTap: () => setState(() => filter = 'active'),
              ),
              _FilterButton(
                label: '待完成',
                count: tasks.where((item) => item.status == 'todo').length,
                active: filter == 'todo',
                onTap: () => setState(() => filter = 'todo'),
              ),
              _FilterButton(
                label: '进行中',
                count: tasks
                    .where((item) => item.status == 'in_progress')
                    .length,
                active: filter == 'in_progress',
                onTap: () => setState(() => filter = 'in_progress'),
              ),
              _FilterButton(
                label: '已完成',
                count: tasks.where((item) => item.status == 'done').length,
                active: filter == 'done',
                onTap: () => setState(() => filter = 'done'),
              ),
              _FilterButton(
                label: '全部',
                count: tasks.length,
                active: filter == 'all',
                onTap: () => setState(() => filter = 'all'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SectionCard(
            child: visible.isEmpty
                ? const EmptyState(
                    icon: Icons.check_box_outlined,
                    title: '没有匹配任务',
                    message: '调整筛选条件，或创建一项新任务。',
                  )
                : Column(
                    children: visible
                        .map(
                          (task) => Column(
                            children: [
                              TaskTile(
                                task: task,
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
                                  await ref
                                      .read(repositoryProvider)
                                      .deleteTask(task.id);
                                  refreshCore(ref);
                                },
                              ),
                              const Divider(height: 1),
                            ],
                          ),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: onTap,
    style: OutlinedButton.styleFrom(
      backgroundColor: active ? ZhixuColors.accentSoft : null,
      side: BorderSide(
        color: active ? ZhixuColors.accent : Theme.of(context).dividerColor,
      ),
    ),
    child: Text('$label  $count'),
  );
}
