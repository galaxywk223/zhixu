import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../data/repository.dart';
import '../../state/providers.dart';

const taskTagColors = [
  '#6366F1',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#64748B',
];

Future<void> showTaskEditor(
  BuildContext context,
  WidgetRef ref, {
  Task? task,
}) async {
  final repository = ref.read(repositoryProvider);
  final categories = await repository.taskCategories();
  var tags = await repository.activeTags();
  final selectedTagIds = task == null
      ? <String>{}
      : await repository.tagIdsForTask(task.id);
  if (!context.mounted) return;

  final title = TextEditingController(text: task?.title ?? '');
  final description = TextEditingController(text: task?.descriptionMd ?? '');
  final minutes = TextEditingController(
    text: task == null || task.estimatedMinutes == 0
        ? ''
        : '${task.estimatedMinutes}',
  );
  var priority = task?.priority ?? 1;
  var categoryId = task?.categoryId;
  DateTime? dueAt = task?.dueAt?.toLocal();

  final isDark = Theme.of(context).brightness == Brightness.dark;

  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      titlePadding: const EdgeInsets.fromLTRB(24, 22, 24, 16),
      contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      actionsPadding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: ZhixuColors.accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              task == null ? Icons.add_task : Icons.edit_note,
              color: ZhixuColors.accent,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Text(task == null ? '添加任务' : '编辑任务'),
        ],
      ),
      content: SizedBox(
        width: 640,
        child: StatefulBuilder(
          builder: (context, setState) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: title,
                  autofocus: true,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                  decoration: const InputDecoration(labelText: '任务名称 *'),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: description,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: '备注 / 描述'),
                ),
                const SizedBox(height: 20),
                _SectionHeader(
                  icon: Icons.folder_open_outlined,
                  title: '分类与标签',
                ),
                const SizedBox(height: 12),
                DropdownMenu<String>(
                  initialSelection: categoryId ?? '',
                  expandedInsets: EdgeInsets.zero,
                  enableFilter: true,
                  enableSearch: true,
                  label: const Text('选择分类'),
                  leadingIcon: const Icon(Icons.folder_outlined, size: 19),
                  dropdownMenuEntries: [
                    const DropdownMenuEntry(value: '', label: '未分类'),
                    for (final category in categories.where(
                      (item) => !item.isArchived || item.id == categoryId,
                    ))
                      DropdownMenuEntry(
                        value: category.id,
                        label: category.isArchived
                            ? '${category.name}（历史分类）'
                            : category.name,
                        leadingIcon: Icon(
                          Icons.circle,
                          size: 11,
                          color: colorFromHex(category.colorHex),
                        ),
                      ),
                  ],
                  onSelected: (value) => setState(
                    () => categoryId = value == null || value.isEmpty
                        ? null
                        : value,
                  ),
                ),
                if (categories.where((item) => !item.isArchived).isEmpty) ...[
                  const SizedBox(height: 7),
                  const Text(
                    '暂无分类，导入番茄记录或添加后可选择。',
                    style: TextStyle(color: ZhixuColors.muted, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 14),
                InputDecorator(
                  decoration: const InputDecoration(labelText: '已选标签'),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final tag in tags)
                        FilterChip(
                          label: Text(tag.name),
                          selected: selectedTagIds.contains(tag.id),
                          selectedColor: ZhixuColors.accent.withValues(
                            alpha: 0.2,
                          ),
                          side: BorderSide(
                            color: selectedTagIds.contains(tag.id)
                                ? ZhixuColors.accent
                                : (isDark
                                      ? ZhixuColors.border
                                      : Colors.grey.shade300),
                          ),
                          avatar: Icon(
                            Icons.circle,
                            size: 11,
                            color: colorFromHex(tag.colorHex),
                          ),
                          onSelected: (selected) => setState(() {
                            if (selected) {
                              selectedTagIds.add(tag.id);
                            } else {
                              selectedTagIds.remove(tag.id);
                            }
                          }),
                        ),
                      ActionChip(
                        avatar: const Icon(Icons.add, size: 16),
                        label: const Text('新建标签'),
                        onPressed: () async {
                          final id = await showTagEditor(context, ref);
                          if (id == null) return;
                          final refreshed = await repository.activeTags();
                          setState(() {
                            tags = refreshed;
                            selectedTagIds.add(id);
                          });
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                _SectionHeader(icon: Icons.alarm_outlined, title: '计划与到期安排'),
                const SizedBox(height: 12),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<int>(
                        initialValue: priority,
                        decoration: const InputDecoration(labelText: '优先级'),
                        items: const [
                          DropdownMenuItem(value: 1, child: Text('低')),
                          DropdownMenuItem(value: 2, child: Text('中')),
                          DropdownMenuItem(value: 3, child: Text('高')),
                        ],
                        onChanged: (value) =>
                            setState(() => priority = value ?? 1),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: minutes,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        decoration: const InputDecoration(
                          labelText: '计划时长',
                          suffixText: '分钟',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final preset in const [15, 30, 60, 120])
                      ActionChip(
                        label: Text(
                          preset < 60 ? '$preset 分钟' : '${preset ~/ 60} 小时',
                        ),
                        onPressed: () =>
                            setState(() => minutes.text = preset.toString()),
                      ),
                    if (minutes.text.isNotEmpty)
                      ActionChip(
                        avatar: const Icon(Icons.close, size: 16),
                        label: const Text('清除时长'),
                        onPressed: () => setState(minutes.clear),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                InputDecorator(
                  decoration: const InputDecoration(labelText: '到期时间'),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          dueAt == null
                              ? '未设置到期时间'
                              : formatLocalDateTime(dueAt!),
                          style: TextStyle(
                            color: dueAt == null ? ZhixuColors.muted : null,
                            fontWeight: dueAt == null
                                ? FontWeight.normal
                                : FontWeight.w600,
                          ),
                        ),
                      ),
                      TextButton.icon(
                        icon: const Icon(Icons.event_outlined, size: 18),
                        label: const Text('选择时间'),
                        onPressed: () async {
                          final day = await showDatePicker(
                            context: context,
                            firstDate: DateTime(2020),
                            lastDate: DateTime(2100),
                            initialDate: dueAt ?? DateTime.now(),
                            initialEntryMode: DatePickerEntryMode.calendarOnly,
                            builder: (context, child) => Theme(
                              data: Theme.of(context).copyWith(
                                dialogTheme: DialogThemeData(
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    side: const BorderSide(
                                      color: ZhixuColors.border,
                                    ),
                                  ),
                                ),
                              ),
                              child: child!,
                            ),
                          );
                          if (day == null || !context.mounted) return;
                          final time = await showTimePicker(
                            context: context,
                            initialTime: TimeOfDay.fromDateTime(
                              dueAt ?? DateTime.now(),
                            ),
                          );
                          setState(
                            () => dueAt = DateTime(
                              day.year,
                              day.month,
                              day.day,
                              time?.hour ?? 18,
                              time?.minute ?? 0,
                            ),
                          );
                        },
                      ),
                      if (dueAt != null)
                        IconButton(
                          tooltip: '清除到期时间',
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: () => setState(() => dueAt = null),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () async {
            if (title.text.trim().isEmpty) return;
            final draft = TaskDraft(
              title: title.text,
              descriptionMd: description.text.trim().isEmpty
                  ? null
                  : description.text,
              priority: priority,
              dueAt: dueAt,
              estimatedMinutes: int.tryParse(minutes.text) ?? 0,
              categoryId: categoryId,
              tagIds: selectedTagIds,
            );
            if (task == null) {
              await repository.createTask(draft);
            } else {
              await repository.updateTask(task.id, draft);
            }
            if (dialogContext.mounted) Navigator.pop(dialogContext, true);
            refreshCore(ref);
          },
          child: const Text('保存任务'),
        ),
      ],
    ),
  );
  title.dispose();
  description.dispose();
  minutes.dispose();
  if (result == true && context.mounted) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('任务已成功保存')));
  }
}

Future<String?> showTagEditor(
  BuildContext context,
  WidgetRef ref, {
  Tag? tag,
}) async {
  final name = TextEditingController(text: tag?.name ?? '');
  var colorHex = tag?.colorHex ?? taskTagColors.first;
  final result = await showDialog<String>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text(tag == null ? '新建标签' : '编辑标签'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: name,
                autofocus: true,
                decoration: const InputDecoration(labelText: '标签名称 *'),
              ),
              const SizedBox(height: 16),
              Text(
                '挑选色彩',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: ZhixuColors.muted,
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final value in taskTagColors)
                    GestureDetector(
                      onTap: () => setState(() => colorHex = value),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: colorFromHex(value),
                          shape: BoxShape.circle,
                          border: value == colorHex
                              ? Border.all(color: Colors.white, width: 3)
                              : null,
                          boxShadow: value == colorHex
                              ? [
                                  BoxShadow(
                                    color: colorFromHex(
                                      value,
                                    ).withValues(alpha: 0.6),
                                    blurRadius: 8,
                                    spreadRadius: 2,
                                  ),
                                ]
                              : null,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () async {
              if (name.text.trim().isEmpty) return;
              try {
                final repository = ref.read(repositoryProvider);
                final id = tag == null
                    ? await repository.createTag(name.text, colorHex)
                    : tag.id;
                if (tag != null) {
                  await repository.updateTag(tag.id, name.text, colorHex);
                }
                if (dialogContext.mounted) Navigator.pop(dialogContext, id);
                refreshCore(ref);
              } catch (error) {
                if (dialogContext.mounted) {
                  ScaffoldMessenger.of(
                    dialogContext,
                  ).showSnackBar(SnackBar(content: Text('$error')));
                }
              }
            },
            child: const Text('保存'),
          ),
        ],
      ),
    ),
  );
  name.dispose();
  return result;
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 16, color: ZhixuColors.accent),
      const SizedBox(width: 8),
      Text(
        title,
        style: const TextStyle(
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
        ),
      ),
      const SizedBox(width: 10),
      const Expanded(child: Divider()),
    ],
  );
}

Color colorFromHex(String value) {
  final normalized = value.replaceFirst('#', '');
  return Color(int.parse('FF$normalized', radix: 16));
}

String formatLocalDateTime(DateTime value) =>
    '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')} '
    '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
