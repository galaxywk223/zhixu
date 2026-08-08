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
  String sortOrder = 'updated';
  String categoryFilter = 'all';
  String tagFilter = 'all';

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(tasksProvider).valueOrNull ?? const <Task>[];
    final categories =
        ref.watch(taskCategoriesProvider).valueOrNull ?? const <TaskCategory>[];
    final tags = ref.watch(tagsProvider).valueOrNull ?? const <Tag>[];
    final tagLinks =
        ref.watch(taskTagLinksProvider).valueOrNull ?? const <TagLink>[];
    final categoryById = {for (final item in categories) item.id: item};
    final tagById = {for (final item in tags) item.id: item};
    final tagIdsByTask = <String, Set<String>>{};
    for (final link in tagLinks) {
      tagIdsByTask.putIfAbsent(link.entityId, () => {}).add(link.tagId);
    }
    final visible =
        tasks.where((task) {
          final matchesFilter =
              filter == 'all' ||
              (filter == 'active'
                  ? task.status != 'done'
                  : task.status == filter);
          final matchesQuery =
              query.trim().isEmpty ||
              task.title.toLowerCase().contains(query.toLowerCase()) ||
              (categoryById[task.categoryId]?.name.toLowerCase().contains(
                    query.toLowerCase(),
                  ) ??
                  false) ||
              (tagIdsByTask[task.id] ?? const <String>{}).any(
                (id) =>
                    tagById[id]?.name.toLowerCase().contains(
                      query.toLowerCase(),
                    ) ??
                    false,
              );
          final matchesCategory =
              categoryFilter == 'all' || task.categoryId == categoryFilter;
          final matchesTag =
              tagFilter == 'all' ||
              (tagIdsByTask[task.id] ?? const <String>{}).contains(tagFilter);
          return matchesFilter && matchesQuery && matchesCategory && matchesTag;
        }).toList()..sort(
          (a, b) => switch (sortOrder) {
            'priority' => b.priority.compareTo(a.priority),
            'due' => (a.dueAt ?? DateTime(9999)).compareTo(
              b.dueAt ?? DateTime(9999),
            ),
            _ => b.updatedAt.compareTo(a.updatedAt),
          },
        );
    return PageFrame(
      title: '任务',
      subtitle: '手动创建、安排并完成待办；专注记录不会出现在此处。',
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _FilterButton(
                      label: '待处理',
                      count: tasks
                          .where((item) => item.status != 'done')
                          .length,
                      active: filter == 'active',
                      onTap: () => setState(() => filter = 'active'),
                    ),
                    _FilterButton(
                      label: '待完成',
                      count: tasks
                          .where((item) => item.status == 'todo')
                          .length,
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
                      count: tasks
                          .where((item) => item.status == 'done')
                          .length,
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
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 170,
                child: DropdownButtonFormField<String>(
                  initialValue: categoryFilter,
                  decoration: const InputDecoration(labelText: '分类'),
                  items: [
                    const DropdownMenuItem(value: 'all', child: Text('全部分类')),
                    for (final category in categories)
                      DropdownMenuItem(
                        value: category.id,
                        child: Text(
                          category.isArchived
                              ? '${category.name} · 历史'
                              : category.name,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                  ],
                  onChanged: (value) =>
                      setState(() => categoryFilter = value ?? 'all'),
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 150,
                child: DropdownButtonFormField<String>(
                  initialValue: tagFilter,
                  decoration: const InputDecoration(labelText: '标签'),
                  items: [
                    const DropdownMenuItem(value: 'all', child: Text('全部标签')),
                    for (final tag in tags)
                      DropdownMenuItem(value: tag.id, child: Text(tag.name)),
                  ],
                  onChanged: (value) =>
                      setState(() => tagFilter = value ?? 'all'),
                ),
              ),
              const SizedBox(width: 10),
              SizedBox(
                width: 150,
                child: DropdownButtonFormField<String>(
                  initialValue: sortOrder,
                  decoration: const InputDecoration(labelText: '排序'),
                  items: const [
                    DropdownMenuItem(value: 'updated', child: Text('最近更新')),
                    DropdownMenuItem(value: 'due', child: Text('截止时间')),
                    DropdownMenuItem(value: 'priority', child: Text('优先级')),
                  ],
                  onChanged: (value) {
                    if (value != null) setState(() => sortOrder = value);
                  },
                ),
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
                                category: categoryById[task.categoryId],
                                tags:
                                    (tagIdsByTask[task.id] ?? const <String>{})
                                        .map((id) => tagById[id])
                                        .whereType<Tag>()
                                        .toList(),
                                onEdit: () =>
                                    showTaskEditor(context, ref, task: task),
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
      backgroundColor: active
          ? Theme.of(context).colorScheme.primaryContainer
          : null,
      side: BorderSide(
        color: active ? ZhixuColors.accent : Theme.of(context).dividerColor,
      ),
    ),
    child: Text('$label  $count'),
  );
}
