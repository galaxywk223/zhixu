import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';
import 'task_page_model.dart';

class TasksPage extends ConsumerStatefulWidget {
  const TasksPage({super.key});

  @override
  ConsumerState<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends ConsumerState<TasksPage> {
  final searchController = TextEditingController();
  TaskQuickView quickView = TaskQuickView.active;
  String statusFilter = 'all';
  String sortOrder = 'updated';
  String categoryFilter = 'all';
  String tagFilter = 'all';
  bool filtersExpanded = false;

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

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
    final now = DateTime.now();
    final selectedCategory = categories.any((item) => item.id == categoryFilter)
        ? categoryFilter
        : 'all';
    final selectedTag = tags.any((item) => item.id == tagFilter)
        ? tagFilter
        : 'all';
    final query = searchController.text.trim().toLowerCase();
    final visible = tasks.where((task) {
      final matchesView = matchesTaskQuickView(task, quickView, now: now);
      final matchesStatus =
          statusFilter == 'all' ||
          (statusFilter == 'active'
              ? task.status != 'done'
              : task.status == statusFilter);
      final matchesQuery =
          query.isEmpty ||
          task.title.toLowerCase().contains(query) ||
          (categoryById[task.categoryId]?.name.toLowerCase().contains(query) ??
              false) ||
          (tagIdsByTask[task.id] ?? const <String>{}).any(
            (id) => tagById[id]?.name.toLowerCase().contains(query) ?? false,
          );
      final matchesCategory =
          selectedCategory == 'all' || task.categoryId == selectedCategory;
      final matchesTag =
          selectedTag == 'all' ||
          (tagIdsByTask[task.id] ?? const <String>{}).contains(selectedTag);
      return matchesView &&
          matchesStatus &&
          matchesQuery &&
          matchesCategory &&
          matchesTag;
    }).toList();
    final compare = _taskComparator(sortOrder);
    final groups = groupTasksByDate(visible, now: now, compare: compare);
    final summary = summarizeTaskWorkspace(tasks, now: now);
    final activeFilterCount = [
      statusFilter != 'all',
      selectedCategory != 'all',
      selectedTag != 'all',
    ].where((active) => active).length;

    return PageFrame(
      title: '任务管理',
      subtitle: '集中查看、分类整理并快速推进所有任务。',
      actions: [
        SizedBox(
          width: 270,
          child: TextField(
            key: const Key('task-search-field'),
            controller: searchController,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search, size: 19),
              hintText: '搜索任务、分类、标签...',
            ),
            onChanged: (_) => setState(() {}),
          ),
        ),
        Badge(
          isLabelVisible: activeFilterCount > 0,
          label: Text('$activeFilterCount'),
          child: OutlinedButton.icon(
            key: const Key('task-filter-toggle'),
            onPressed: () => setState(() => filtersExpanded = !filtersExpanded),
            icon: Icon(
              filtersExpanded ? Icons.filter_alt : Icons.filter_alt_outlined,
              size: 18,
            ),
            label: const Text('筛选'),
          ),
        ),
        FilledButton.icon(
          onPressed: () => showTaskEditor(context, ref),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('添加任务'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SummaryGrid(summary: summary),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            child: filtersExpanded
                ? Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: _FilterPanel(
                      quickView: quickView,
                      statusFilter: statusFilter,
                      categoryFilter: selectedCategory,
                      tagFilter: selectedTag,
                      categories: categories,
                      tags: tags,
                      onQuickViewChanged: (value) =>
                          setState(() => quickView = value),
                      onStatusChanged: (value) =>
                          setState(() => statusFilter = value),
                      onCategoryChanged: (value) =>
                          setState(() => categoryFilter = value),
                      onTagChanged: (value) =>
                          setState(() => tagFilter = value),
                      onReset: _resetFilters,
                    ),
                  )
                : const SizedBox.shrink(),
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              final showRail = constraints.maxWidth >= 1040;
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (showRail) ...[
                    SizedBox(
                      width: 208,
                      child: _QuickViewRail(
                        tasks: tasks,
                        categories: categories,
                        tags: tags,
                        tagIdsByTask: tagIdsByTask,
                        quickView: quickView,
                        categoryFilter: selectedCategory,
                        tagFilter: selectedTag,
                        now: now,
                        onQuickViewChanged: (value) =>
                            setState(() => quickView = value),
                        onCategoryChanged: (value) =>
                            setState(() => categoryFilter = value),
                        onTagChanged: (value) =>
                            setState(() => tagFilter = value),
                      ),
                    ),
                    const SizedBox(width: 16),
                  ],
                  Expanded(
                    child: _TaskTable(
                      groups: groups,
                      visibleCount: visible.length,
                      title: _quickViewLabel(quickView),
                      categoryById: categoryById,
                      tagById: tagById,
                      tagIdsByTask: tagIdsByTask,
                      sortOrder: sortOrder,
                      now: now,
                      onSortChanged: (value) =>
                          setState(() => sortOrder = value),
                      onEdit: (task) =>
                          showTaskEditor(context, ref, task: task),
                      onToggle: _toggleTask,
                      onDelete: _deleteTask,
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  void _resetFilters() {
    setState(() {
      quickView = TaskQuickView.active;
      statusFilter = 'all';
      categoryFilter = 'all';
      tagFilter = 'all';
    });
  }

  Future<void> _toggleTask(Task task) async {
    await ref
        .read(repositoryProvider)
        .setTaskStatus(task.id, task.status == 'done' ? 'todo' : 'done');
    refreshCore(ref);
  }

  Future<void> _deleteTask(Task task) async {
    await ref.read(repositoryProvider).deleteTask(task.id);
    refreshCore(ref);
  }
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.summary});

  final TaskWorkspaceSummary summary;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = constraints.maxWidth >= 1000
          ? 6
          : constraints.maxWidth >= 620
          ? 3
          : 2;
      const spacing = 12.0;
      final width = (constraints.maxWidth - spacing * (columns - 1)) / columns;
      final items = [
        _SummaryItem('任务总数', '${summary.total}', Icons.check_box_outlined),
        _SummaryItem(
          '今日到期',
          '${summary.dueToday}',
          Icons.calendar_today_outlined,
          ZhixuColors.warning,
        ),
        _SummaryItem(
          '逾期',
          '${summary.overdue}',
          Icons.warning_amber_outlined,
          ZhixuColors.danger,
        ),
        _SummaryItem(
          '本周完成',
          '${summary.completedThisWeek}',
          Icons.check_circle_outline,
          ZhixuColors.success,
        ),
        _SummaryItem(
          '进行中',
          '${summary.inProgress}',
          Icons.play_circle_outline,
          ZhixuColors.accent,
        ),
        _SummaryItem(
          '计划时长',
          _durationLabel(summary.activeEstimatedMinutes),
          Icons.schedule_outlined,
          ZhixuColors.cyan,
        ),
      ];
      return Wrap(
        spacing: spacing,
        runSpacing: spacing,
        children: [
          for (final item in items)
            SizedBox(width: width, height: 76, child: item),
        ],
      );
    },
  );
}

class _SummaryItem extends StatelessWidget {
  const _SummaryItem(this.label, this.value, this.icon, [this.color]);

  final String label;
  final String value;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final accent = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Row(
        children: [
          Icon(icon, size: 21, color: accent),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 2),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterPanel extends StatelessWidget {
  const _FilterPanel({
    required this.quickView,
    required this.statusFilter,
    required this.categoryFilter,
    required this.tagFilter,
    required this.categories,
    required this.tags,
    required this.onQuickViewChanged,
    required this.onStatusChanged,
    required this.onCategoryChanged,
    required this.onTagChanged,
    required this.onReset,
  });

  final TaskQuickView quickView;
  final String statusFilter;
  final String categoryFilter;
  final String tagFilter;
  final List<TaskCategory> categories;
  final List<Tag> tags;
  final ValueChanged<TaskQuickView> onQuickViewChanged;
  final ValueChanged<String> onStatusChanged;
  final ValueChanged<String> onCategoryChanged;
  final ValueChanged<String> onTagChanged;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('task-filter-panel'),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(7),
      border: Border.all(color: Theme.of(context).dividerColor),
    ),
    child: Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: 160,
          child: DropdownButtonFormField<TaskQuickView>(
            key: const Key('task-view-filter'),
            initialValue: quickView,
            decoration: const InputDecoration(labelText: '视图'),
            items: [
              for (final view in TaskQuickView.values)
                DropdownMenuItem(
                  value: view,
                  child: Text(_quickViewLabel(view)),
                ),
            ],
            onChanged: (value) {
              if (value != null) onQuickViewChanged(value);
            },
          ),
        ),
        SizedBox(
          width: 150,
          child: DropdownButtonFormField<String>(
            initialValue: statusFilter,
            decoration: const InputDecoration(labelText: '状态'),
            items: const [
              DropdownMenuItem(value: 'all', child: Text('全部状态')),
              DropdownMenuItem(value: 'active', child: Text('未完成')),
              DropdownMenuItem(value: 'todo', child: Text('待完成')),
              DropdownMenuItem(value: 'in_progress', child: Text('进行中')),
              DropdownMenuItem(value: 'done', child: Text('已完成')),
            ],
            onChanged: (value) => onStatusChanged(value ?? 'all'),
          ),
        ),
        SizedBox(
          width: 190,
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
            onChanged: (value) => onCategoryChanged(value ?? 'all'),
          ),
        ),
        SizedBox(
          width: 170,
          child: DropdownButtonFormField<String>(
            initialValue: tagFilter,
            decoration: const InputDecoration(labelText: '标签'),
            items: [
              const DropdownMenuItem(value: 'all', child: Text('全部标签')),
              for (final tag in tags)
                DropdownMenuItem(value: tag.id, child: Text(tag.name)),
            ],
            onChanged: (value) => onTagChanged(value ?? 'all'),
          ),
        ),
        TextButton.icon(
          onPressed: onReset,
          icon: const Icon(Icons.restart_alt, size: 18),
          label: const Text('重置筛选'),
        ),
      ],
    ),
  );
}

class _QuickViewRail extends StatelessWidget {
  const _QuickViewRail({
    required this.tasks,
    required this.categories,
    required this.tags,
    required this.tagIdsByTask,
    required this.quickView,
    required this.categoryFilter,
    required this.tagFilter,
    required this.now,
    required this.onQuickViewChanged,
    required this.onCategoryChanged,
    required this.onTagChanged,
  });

  final List<Task> tasks;
  final List<TaskCategory> categories;
  final List<Tag> tags;
  final Map<String, Set<String>> tagIdsByTask;
  final TaskQuickView quickView;
  final String categoryFilter;
  final String tagFilter;
  final DateTime now;
  final ValueChanged<TaskQuickView> onQuickViewChanged;
  final ValueChanged<String> onCategoryChanged;
  final ValueChanged<String> onTagChanged;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _RailSection(
        title: '视图',
        children: [
          for (final view in TaskQuickView.values)
            _RailItem(
              key: Key('task-view-${view.name}'),
              label: _quickViewLabel(view),
              icon: _quickViewIcon(view),
              count: tasks
                  .where((task) => matchesTaskQuickView(task, view, now: now))
                  .length,
              selected: quickView == view,
              onTap: () => onQuickViewChanged(view),
            ),
        ],
      ),
      if (categories.isNotEmpty) ...[
        const SizedBox(height: 12),
        _RailSection(
          title: '分类',
          children: [
            _RailItem(
              key: const Key('task-category-all'),
              label: '全部分类',
              icon: Icons.folder_outlined,
              count: tasks.length,
              selected: categoryFilter == 'all',
              onTap: () => onCategoryChanged('all'),
            ),
            for (final category in categories)
              _RailItem(
                key: Key('task-category-${category.id}'),
                label: category.isArchived
                    ? '${category.name} · 历史'
                    : category.name,
                color: _colorFromHex(category.colorHex),
                count: tasks
                    .where((task) => task.categoryId == category.id)
                    .length,
                selected: categoryFilter == category.id,
                onTap: () => onCategoryChanged(category.id),
              ),
          ],
        ),
      ],
      if (tags.isNotEmpty) ...[
        const SizedBox(height: 12),
        _RailSection(
          title: '标签',
          children: [
            _RailItem(
              key: const Key('task-tag-all'),
              label: '全部标签',
              icon: Icons.label_outline,
              count: tasks.length,
              selected: tagFilter == 'all',
              onTap: () => onTagChanged('all'),
            ),
            for (final tag in tags)
              _RailItem(
                key: Key('task-tag-${tag.id}'),
                label: tag.name,
                color: _colorFromHex(tag.colorHex),
                count: tasks
                    .where(
                      (task) =>
                          tagIdsByTask[task.id]?.contains(tag.id) ?? false,
                    )
                    .length,
                selected: tagFilter == tag.id,
                onTap: () => onTagChanged(tag.id),
              ),
          ],
        ),
      ],
    ],
  );
}

class _RailSection extends StatelessWidget {
  const _RailSection({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(8, 12, 8, 8),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(7),
      border: Border.all(color: Theme.of(context).dividerColor),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 7),
          child: Text(title, style: Theme.of(context).textTheme.titleMedium),
        ),
        ...children,
      ],
    ),
  );
}

class _RailItem extends StatelessWidget {
  const _RailItem({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
    this.icon,
    this.color,
    super.key,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final foreground = selected ? colors.onPrimaryContainer : colors.onSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: 3),
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: onTap,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 9),
          decoration: BoxDecoration(
            color: selected ? colors.primaryContainer : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            children: [
              if (color != null)
                Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                  ),
                )
              else
                Icon(icon, size: 17, color: foreground),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 14,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                ),
              ),
              Text(
                '$count',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: selected ? colors.onPrimaryContainer : null,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskTable extends StatelessWidget {
  const _TaskTable({
    required this.groups,
    required this.visibleCount,
    required this.title,
    required this.categoryById,
    required this.tagById,
    required this.tagIdsByTask,
    required this.sortOrder,
    required this.now,
    required this.onSortChanged,
    required this.onEdit,
    required this.onToggle,
    required this.onDelete,
  });

  final List<TaskDateGroup> groups;
  final int visibleCount;
  final String title;
  final Map<String, TaskCategory> categoryById;
  final Map<String, Tag> tagById;
  final Map<String, Set<String>> tagIdsByTask;
  final String sortOrder;
  final DateTime now;
  final ValueChanged<String> onSortChanged;
  final ValueChanged<Task> onEdit;
  final ValueChanged<Task> onToggle;
  final ValueChanged<Task> onDelete;

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('task-table'),
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surface,
      borderRadius: BorderRadius.circular(7),
      border: Border.all(color: Theme.of(context).dividerColor),
    ),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final showPriority = constraints.maxWidth >= 700;
        final showTags = constraints.maxWidth >= 800;
        final showDuration = constraints.maxWidth >= 590;
        return Column(
          children: [
            _TaskTableToolbar(
              title: title,
              count: visibleCount,
              sortOrder: sortOrder,
              onSortChanged: onSortChanged,
            ),
            _TaskTableHeader(
              showPriority: showPriority,
              showTags: showTags,
              showDuration: showDuration,
            ),
            if (groups.isEmpty)
              const EmptyState(
                icon: Icons.check_box_outlined,
                title: '没有匹配任务',
                message: '调整视图或筛选条件，或创建一项新任务。',
              )
            else
              for (final group in groups) ...[
                _TaskGroupHeader(group: group),
                for (final task in group.tasks)
                  _TaskTableRow(
                    task: task,
                    category: categoryById[task.categoryId],
                    tags: (tagIdsByTask[task.id] ?? const <String>{})
                        .map((id) => tagById[id])
                        .whereType<Tag>()
                        .toList(),
                    now: now,
                    showPriority: showPriority,
                    showTags: showTags,
                    showDuration: showDuration,
                    onEdit: () => onEdit(task),
                    onToggle: () => onToggle(task),
                    onDelete: () => onDelete(task),
                  ),
              ],
          ],
        );
      },
    ),
  );
}

class _TaskTableToolbar extends StatelessWidget {
  const _TaskTableToolbar({
    required this.title,
    required this.count,
    required this.sortOrder,
    required this.onSortChanged,
  });

  final String title;
  final int count;
  final String sortOrder;
  final ValueChanged<String> onSortChanged;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 54,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('$count', style: Theme.of(context).textTheme.bodySmall),
          ),
          const Spacer(),
          PopupMenuButton<String>(
            tooltip: '任务排序',
            initialValue: sortOrder,
            onSelected: onSortChanged,
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'updated', child: Text('最近更新')),
              PopupMenuItem(value: 'due', child: Text('到期时间')),
              PopupMenuItem(value: 'priority', child: Text('优先级')),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
              child: Row(
                children: [
                  Text(
                    '排序：${_sortLabel(sortOrder)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.expand_more, size: 18),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _TaskTableHeader extends StatelessWidget {
  const _TaskTableHeader({
    required this.showPriority,
    required this.showTags,
    required this.showDuration,
  });

  final bool showPriority;
  final bool showTags;
  final bool showDuration;

  @override
  Widget build(BuildContext context) => Container(
    height: 40,
    padding: const EdgeInsets.symmetric(horizontal: 8),
    decoration: BoxDecoration(
      color: Theme.of(
        context,
      ).colorScheme.surfaceContainerHighest.withValues(alpha: .45),
      border: Border.symmetric(
        horizontal: BorderSide(color: Theme.of(context).dividerColor),
      ),
    ),
    child: Row(
      children: [
        const SizedBox(width: 44),
        const Expanded(flex: 5, child: _ColumnLabel('任务')),
        const SizedBox(width: 110, child: _ColumnLabel('到期时间')),
        if (showPriority) const SizedBox(width: 76, child: _ColumnLabel('优先级')),
        if (showTags) const SizedBox(width: 140, child: _ColumnLabel('标签')),
        const SizedBox(width: 100, child: _ColumnLabel('状态')),
        if (showDuration)
          const SizedBox(width: 90, child: _ColumnLabel('计划时长')),
        const SizedBox(width: 44),
      ],
    ),
  );
}

class _ColumnLabel extends StatelessWidget {
  const _ColumnLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Text(text, style: Theme.of(context).textTheme.bodySmall),
  );
}

class _TaskGroupHeader extends StatelessWidget {
  const _TaskGroupHeader({required this.group});

  final TaskDateGroup group;

  @override
  Widget build(BuildContext context) {
    final color = _groupColor(group.kind);
    return Container(
      height: 38,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      alignment: Alignment.centerLeft,
      decoration: BoxDecoration(
        color: color.withValues(alpha: .055),
        border: Border(
          bottom: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: Row(
        children: [
          Text(
            _groupLabel(group.kind),
            style: TextStyle(
              color: color,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 7),
          Text(
            '${group.tasks.length}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

class _TaskTableRow extends StatelessWidget {
  const _TaskTableRow({
    required this.task,
    required this.tags,
    required this.now,
    required this.showPriority,
    required this.showTags,
    required this.showDuration,
    required this.onEdit,
    required this.onToggle,
    required this.onDelete,
    this.category,
  });

  final Task task;
  final TaskCategory? category;
  final List<Tag> tags;
  final DateTime now;
  final bool showPriority;
  final bool showTags;
  final bool showDuration;
  final VoidCallback onEdit;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final done = task.status == 'done';
    final secondary = <String>[
      if (category != null)
        category!.isArchived ? '${category!.name} · 历史' : category!.name,
      if (!showPriority) '优先级${priorityLabel(task.priority)}',
      if (!showTags && tags.isNotEmpty) tags.map((tag) => tag.name).join(' · '),
    ];
    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: Key('task-row-${task.id}'),
        onTap: onEdit,
        child: Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: Theme.of(context).dividerColor),
            ),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 44,
                child: Checkbox(
                  key: Key('task-complete-${task.id}'),
                  value: done,
                  onChanged: (_) => onToggle(),
                ),
              ),
              Expanded(
                flex: 5,
                child: Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        task.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: done ? ZhixuColors.muted : null,
                          decoration: done ? TextDecoration.lineThrough : null,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (secondary.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          secondary.join('  ·  '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              SizedBox(
                width: 110,
                child: Text(
                  task.dueAt == null ? '—' : _dateTimeLabel(task.dueAt!),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: _dueColor(task, now),
                    fontSize: 13,
                    fontWeight: task.dueAt == null
                        ? FontWeight.w400
                        : FontWeight.w600,
                  ),
                ),
              ),
              if (showPriority)
                SizedBox(
                  width: 76,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: _PriorityBadge(priority: task.priority),
                  ),
                ),
              if (showTags) SizedBox(width: 140, child: _TagsCell(tags: tags)),
              SizedBox(
                width: 100,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: _StatusLabel(status: task.status),
                ),
              ),
              if (showDuration)
                SizedBox(
                  width: 90,
                  child: Text(
                    task.estimatedMinutes == 0
                        ? '—'
                        : _durationLabel(task.estimatedMinutes),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              SizedBox(
                width: 44,
                child: PopupMenuButton<_TaskAction>(
                  tooltip: '任务操作',
                  padding: EdgeInsets.zero,
                  icon: const Icon(Icons.more_horiz, size: 20),
                  onSelected: (action) => switch (action) {
                    _TaskAction.edit => onEdit(),
                    _TaskAction.delete => onDelete(),
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(
                      value: _TaskAction.edit,
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.edit_outlined, size: 19),
                        title: Text('编辑'),
                      ),
                    ),
                    PopupMenuItem(
                      value: _TaskAction.delete,
                      child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(Icons.delete_outline, size: 19),
                        title: Text('删除'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _TaskAction { edit, delete }

class _PriorityBadge extends StatelessWidget {
  const _PriorityBadge({required this.priority});

  final int priority;

  @override
  Widget build(BuildContext context) {
    final color = priorityColor(priority);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: .42)),
      ),
      child: Text(
        priorityLabel(priority),
        style: TextStyle(
          color: color,
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _TagsCell extends StatelessWidget {
  const _TagsCell({required this.tags});

  final List<Tag> tags;

  @override
  Widget build(BuildContext context) {
    if (tags.isEmpty) {
      return Text('—', style: Theme.of(context).textTheme.bodySmall);
    }
    final tag = tags.first;
    final color = _colorFromHex(tag.colorHex);
    return Row(
      children: [
        Flexible(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: .1),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: color.withValues(alpha: .35)),
            ),
            child: Text(
              tag.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        if (tags.length > 1) ...[
          const SizedBox(width: 5),
          Text(
            '+${tags.length - 1}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ],
    );
  }
}

class _StatusLabel extends StatelessWidget {
  const _StatusLabel({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(status);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 7),
        Flexible(
          child: Text(
            _statusLabel(status),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: color, fontSize: 13),
          ),
        ),
      ],
    );
  }
}

Comparator<Task> _taskComparator(String order) => switch (order) {
  'priority' => (a, b) {
    final priority = b.priority.compareTo(a.priority);
    return priority != 0 ? priority : b.updatedAt.compareTo(a.updatedAt);
  },
  'due' => (a, b) {
    final aDue = a.dueAt ?? DateTime(9999);
    final bDue = b.dueAt ?? DateTime(9999);
    final due = aDue.compareTo(bDue);
    return due != 0 ? due : b.updatedAt.compareTo(a.updatedAt);
  },
  _ => (a, b) => b.updatedAt.compareTo(a.updatedAt),
};

String _quickViewLabel(TaskQuickView view) => switch (view) {
  TaskQuickView.active => '待处理',
  TaskQuickView.all => '全部任务',
  TaskQuickView.today => '今天',
  TaskQuickView.tomorrow => '明天',
  TaskQuickView.upcoming => '近期 7 天',
  TaskQuickView.noDate => '无日期',
  TaskQuickView.done => '已完成',
};

IconData _quickViewIcon(TaskQuickView view) => switch (view) {
  TaskQuickView.active => Icons.radio_button_unchecked,
  TaskQuickView.all => Icons.check_box_outlined,
  TaskQuickView.today => Icons.today_outlined,
  TaskQuickView.tomorrow => Icons.event_outlined,
  TaskQuickView.upcoming => Icons.date_range_outlined,
  TaskQuickView.noDate => Icons.event_busy_outlined,
  TaskQuickView.done => Icons.check_circle_outline,
};

String _groupLabel(TaskDateGroupKind kind) => switch (kind) {
  TaskDateGroupKind.overdue => '逾期',
  TaskDateGroupKind.today => '今天',
  TaskDateGroupKind.tomorrow => '明天',
  TaskDateGroupKind.upcoming => '近期（7 天）',
  TaskDateGroupKind.later => '以后',
  TaskDateGroupKind.noDate => '无日期',
  TaskDateGroupKind.completed => '已完成',
};

Color _groupColor(TaskDateGroupKind kind) => switch (kind) {
  TaskDateGroupKind.overdue => ZhixuColors.danger,
  TaskDateGroupKind.today => ZhixuColors.danger,
  TaskDateGroupKind.tomorrow => ZhixuColors.warning,
  TaskDateGroupKind.upcoming => ZhixuColors.accent,
  TaskDateGroupKind.later => ZhixuColors.cyan,
  TaskDateGroupKind.noDate => ZhixuColors.muted,
  TaskDateGroupKind.completed => ZhixuColors.success,
};

String _statusLabel(String status) => switch (status) {
  'done' => '已完成',
  'in_progress' => '进行中',
  'blocked' => '受阻',
  _ => '待完成',
};

String _sortLabel(String order) => switch (order) {
  'due' => '到期时间',
  'priority' => '优先级',
  _ => '最近更新',
};

String _dateTimeLabel(DateTime value) {
  final local = value.toLocal();
  return '${local.month}/${local.day} '
      '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
}

String _durationLabel(int minutes) {
  final hours = minutes ~/ 60;
  final remainder = minutes % 60;
  if (hours == 0) return '${remainder}m';
  if (remainder == 0) return '${hours}h';
  return '${hours}h ${remainder}m';
}

Color _dueColor(Task task, DateTime now) {
  final due = task.dueAt?.toLocal();
  if (due == null || task.status == 'done') return ZhixuColors.muted;
  final today = startOfLocalDay(now);
  final tomorrow = today.add(const Duration(days: 1));
  if (due.isBefore(today)) return ZhixuColors.danger;
  if (due.isBefore(tomorrow)) return ZhixuColors.warning;
  return ZhixuColors.muted;
}

Color _colorFromHex(String value) {
  final normalized = value.replaceFirst('#', '');
  final parsed = int.tryParse('FF$normalized', radix: 16);
  return parsed == null ? ZhixuColors.accent : Color(parsed);
}
