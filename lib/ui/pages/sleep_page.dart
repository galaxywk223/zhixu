import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../data/repository.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';

class SleepPage extends ConsumerWidget {
  const SleepPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final events =
        ref.watch(lifeEventsProvider).valueOrNull ?? const <LifeEvent>[];
    final records = ref.watch(sleepRecordsProvider);
    final valid = records.where((record) => record.isValid).toList();
    final now = DateTime.now();
    final weekly = valid
        .where(
          (record) => record.start!.occurredAt.toLocal().isAfter(
            now.subtract(const Duration(days: 7)),
          ),
        )
        .toList();
    final latest = valid.isEmpty ? null : valid.first;
    final average = weekly.isEmpty
        ? null
        : Duration(
            minutes:
                weekly
                    .map((record) => record.duration!.inMinutes)
                    .reduce((a, b) => a + b) ~/
                weekly.length,
          );

    return PageFrame(
      title: '睡眠',
      subtitle: '根据睡觉和起床事件还原睡眠区间，并标记需要修正的记录。',
      actions: [
        FilledButton.icon(
          onPressed: () => _editEvent(context, ref),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('记录事件'),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LayoutBuilder(
            builder: (context, constraints) => GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: constraints.maxWidth > 1000 ? 4 : 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: constraints.maxWidth > 1000 ? 2.2 : 2.5,
              children: [
                MetricCard(
                  label: '最近睡眠',
                  value: _durationLabel(latest?.duration),
                  icon: Icons.bedtime_outlined,
                  color: ZhixuColors.purple,
                ),
                MetricCard(
                  label: '7 日平均',
                  value: _durationLabel(average),
                  icon: Icons.insights_outlined,
                  color: ZhixuColors.accent,
                ),
                MetricCard(
                  label: '平均入睡',
                  value: _averageClock(
                    weekly.map((record) => record.start!.occurredAt),
                  ),
                  icon: Icons.nightlight_outlined,
                  color: ZhixuColors.warning,
                ),
                MetricCard(
                  label: '平均起床',
                  value: _averageClock(
                    weekly.map((record) => record.end!.occurredAt),
                  ),
                  icon: Icons.wb_sunny_outlined,
                  color: ZhixuColors.success,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final timeline = _SleepTimeline(records: records);
              final eventLog = _EventLog(
                events: events,
                onEdit: (event) => _editEvent(context, ref, event),
                onDelete: (event) => _deleteEvent(context, ref, event),
              );
              if (constraints.maxWidth > 1040) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 3, child: timeline),
                    const SizedBox(width: 14),
                    Expanded(flex: 2, child: eventLog),
                  ],
                );
              }
              return Column(
                children: [timeline, const SizedBox(height: 14), eventLog],
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _editEvent(
    BuildContext context,
    WidgetRef ref, [
    LifeEvent? event,
  ]) async {
    var kind = event?.kind == 'wake' ? 'wake' : 'sleep';
    var occurredAt = event?.occurredAt.toLocal() ?? DateTime.now();
    final title = TextEditingController(
      text: event?.title ?? (kind == 'sleep' ? '睡觉' : '起床'),
    );
    final note = TextEditingController(text: event?.note ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(event == null ? '记录睡眠事件' : '修改睡眠事件'),
          content: SizedBox(
            width: 430,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: kind,
                  decoration: const InputDecoration(labelText: '事件类型'),
                  items: const [
                    DropdownMenuItem(value: 'sleep', child: Text('睡觉')),
                    DropdownMenuItem(value: 'wake', child: Text('起床')),
                    DropdownMenuItem(value: 'other', child: Text('其他')),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    setDialogState(() {
                      kind = value;
                      if (title.text == '睡觉' || title.text == '起床') {
                        title.text = value == 'sleep'
                            ? '睡觉'
                            : value == 'wake'
                            ? '起床'
                            : '生活事件';
                      }
                    });
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: title,
                  decoration: const InputDecoration(labelText: '名称'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        DateFormat('yyyy-MM-dd HH:mm').format(occurredAt),
                      ),
                    ),
                    IconButton(
                      tooltip: '选择日期',
                      icon: const Icon(Icons.calendar_month_outlined),
                      onPressed: () async {
                        final date = await showDatePicker(
                          context: context,
                          firstDate: DateTime(2000),
                          lastDate: DateTime(2100),
                          initialDate: occurredAt,
                        );
                        if (date != null) {
                          setDialogState(
                            () => occurredAt = DateTime(
                              date.year,
                              date.month,
                              date.day,
                              occurredAt.hour,
                              occurredAt.minute,
                            ),
                          );
                        }
                      },
                    ),
                    IconButton(
                      tooltip: '选择时间',
                      icon: const Icon(Icons.schedule_outlined),
                      onPressed: () async {
                        final time = await showTimePicker(
                          context: context,
                          initialTime: TimeOfDay.fromDateTime(occurredAt),
                        );
                        if (time != null) {
                          setDialogState(
                            () => occurredAt = DateTime(
                              occurredAt.year,
                              occurredAt.month,
                              occurredAt.day,
                              time.hour,
                              time.minute,
                            ),
                          );
                        }
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: note,
                  decoration: const InputDecoration(labelText: '备注'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('保存'),
            ),
          ],
        ),
      ),
    );
    if (saved == true && title.text.trim().isNotEmpty) {
      final repository = ref.read(repositoryProvider);
      if (event == null) {
        await repository.createLifeEvent(
          kind: kind,
          title: title.text,
          occurredAt: occurredAt,
          note: note.text.trim().isEmpty ? null : note.text.trim(),
        );
      } else {
        await repository.updateLifeEvent(
          event.id,
          kind: kind,
          title: title.text,
          occurredAt: occurredAt,
          note: note.text.trim().isEmpty ? null : note.text.trim(),
        );
      }
      refreshCore(ref);
    }
    title.dispose();
    note.dispose();
  }

  Future<void> _deleteEvent(
    BuildContext context,
    WidgetRef ref,
    LifeEvent event,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除生活事件'),
        content: Text('删除“${event.title}”后会重新计算睡眠配对。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(repositoryProvider).deleteLifeEvent(event.id);
      refreshCore(ref);
    }
  }
}

class _SleepTimeline extends StatelessWidget {
  const _SleepTimeline({required this.records});

  final List<SleepRecord> records;

  @override
  Widget build(BuildContext context) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('睡眠记录', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (records.isEmpty)
          const EmptyState(
            icon: Icons.bedtime_outlined,
            title: '暂无睡眠记录',
            message: '导入或记录睡觉与起床事件后，将自动计算睡眠区间。',
          )
        else
          ...records.take(30).map((record) {
            final start = record.start?.occurredAt.toLocal();
            final end = record.end?.occurredAt.toLocal();
            return ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(
                record.isValid ? Icons.bedtime_outlined : Icons.warning_amber,
                color: record.isValid
                    ? ZhixuColors.purple
                    : ZhixuColors.warning,
              ),
              title: Text(
                record.isValid
                    ? _durationLabel(record.duration)
                    : record.issue ?? '异常记录',
              ),
              subtitle: Text(
                '${start == null ? '缺少睡觉' : DateFormat('MM-dd HH:mm').format(start)}  '
                '→  ${end == null ? '缺少起床' : DateFormat('MM-dd HH:mm').format(end)}',
              ),
            );
          }),
      ],
    ),
  );
}

class _EventLog extends StatelessWidget {
  const _EventLog({
    required this.events,
    required this.onEdit,
    required this.onDelete,
  });

  final List<LifeEvent> events;
  final ValueChanged<LifeEvent> onEdit;
  final ValueChanged<LifeEvent> onDelete;

  @override
  Widget build(BuildContext context) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('生活事件', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (events.isEmpty)
          const Text('暂无事件', style: TextStyle(color: ZhixuColors.muted))
        else
          ...events
              .take(40)
              .map(
                (event) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    event.kind == 'sleep'
                        ? Icons.bedtime_outlined
                        : event.kind == 'wake'
                        ? Icons.wb_sunny_outlined
                        : Icons.circle_outlined,
                    size: 19,
                  ),
                  title: Text(event.title),
                  subtitle: Text(
                    DateFormat(
                      'MM-dd HH:mm',
                    ).format(event.occurredAt.toLocal()),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: '修改',
                        icon: const Icon(Icons.edit_outlined, size: 17),
                        onPressed: () => onEdit(event),
                      ),
                      IconButton(
                        tooltip: '删除',
                        icon: const Icon(Icons.delete_outline, size: 17),
                        onPressed: () => onDelete(event),
                      ),
                    ],
                  ),
                ),
              ),
      ],
    ),
  );
}

String _durationLabel(Duration? duration) {
  if (duration == null) return '--';
  return '${duration.inHours}小时${duration.inMinutes.remainder(60)}分';
}

String _averageClock(Iterable<DateTime> values) {
  final list = values.map((value) => value.toLocal()).toList();
  if (list.isEmpty) return '--';
  final shifted = list.map((value) {
    final minutes = value.hour * 60 + value.minute;
    return minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
  });
  final average = shifted.reduce((a, b) => a + b) ~/ list.length;
  final normalized = average % (24 * 60);
  return '${(normalized ~/ 60).toString().padLeft(2, '0')}:${(normalized % 60).toString().padLeft(2, '0')}';
}
