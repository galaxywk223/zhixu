import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/database.dart';
import '../../data/repository.dart';
import '../../state/providers.dart';

Future<void> showTaskEditor(
  BuildContext context,
  WidgetRef ref, {
  Task? task,
}) async {
  final title = TextEditingController(text: task?.title ?? '');
  final description = TextEditingController(text: task?.descriptionMd ?? '');
  final minutes = TextEditingController(
    text: task == null || task.estimatedMinutes == 0
        ? ''
        : '${task.estimatedMinutes}',
  );
  var priority = task?.priority ?? 1;
  DateTime? dueAt = task?.dueAt?.toLocal();
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(task == null ? '添加任务' : '编辑任务'),
      content: SizedBox(
        width: 520,
        child: StatefulBuilder(
          builder: (context, setState) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: title,
                  autofocus: true,
                  decoration: const InputDecoration(labelText: '任务名称 *'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: description,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: '备注 / 描述'),
                ),
                const SizedBox(height: 12),
                Row(
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
                        decoration: const InputDecoration(labelText: '预计分钟'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        dueAt == null
                            ? '未设置截止时间'
                            : '截止：${dueAt!.year}-${dueAt!.month.toString().padLeft(2, '0')}-${dueAt!.day.toString().padLeft(2, '0')} ${dueAt!.hour.toString().padLeft(2, '0')}:${dueAt!.minute.toString().padLeft(2, '0')}',
                        style: const TextStyle(color: Colors.grey),
                      ),
                    ),
                    TextButton.icon(
                      icon: const Icon(Icons.event_outlined, size: 18),
                      label: const Text('选择'),
                      onPressed: () async {
                        final day = await showDatePicker(
                          context: context,
                          firstDate: DateTime(2020),
                          lastDate: DateTime(2100),
                          initialDate: dueAt ?? DateTime.now(),
                        );
                        if (day == null) return;
                        if (!context.mounted) return;
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
                        tooltip: '清除',
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => setState(() => dueAt = null),
                      ),
                  ],
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
            final repository = ref.read(repositoryProvider);
            final draft = TaskDraft(
              title: title.text,
              descriptionMd: description.text.trim().isEmpty
                  ? null
                  : description.text,
              priority: priority,
              dueAt: dueAt,
              estimatedMinutes: int.tryParse(minutes.text) ?? 0,
            );
            if (task == null) {
              await repository.createTask(draft);
            } else {
              await repository.updateTask(task.id, draft);
            }
            if (dialogContext.mounted) Navigator.pop(dialogContext, true);
            refreshCore(ref);
          },
          child: const Text('保存'),
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
    ).showSnackBar(const SnackBar(content: Text('任务已保存')));
  }
}
