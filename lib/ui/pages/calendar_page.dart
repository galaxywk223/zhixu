import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';

class CalendarPage extends ConsumerStatefulWidget {
  const CalendarPage({super.key});

  @override
  ConsumerState<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends ConsumerState<CalendarPage> {
  DateTime month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime selected = DateUtils.dateOnly(DateTime.now());
  String mode = 'month';

  @override
  Widget build(BuildContext context) {
    final tasks = ref.watch(tasksProvider).valueOrNull ?? const <Task>[];
    return PageFrame(
      title: '日历',
      subtitle: '按月查看任务截止时间，按周规划独立时间块。',
      actions: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(
              value: 'month',
              label: Text('月视图'),
              icon: Icon(Icons.calendar_month, size: 17),
            ),
            ButtonSegment(
              value: 'week',
              label: Text('周视图'),
              icon: Icon(Icons.view_week, size: 17),
            ),
          ],
          selected: {mode},
          onSelectionChanged: (values) => setState(() => mode = values.first),
        ),
        const SizedBox(width: 10),
        FilledButton.icon(
          onPressed: () => showTaskEditor(context, ref),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('添加任务'),
        ),
      ],
      child: mode == 'month'
          ? _MonthPanel(
              month: month,
              selected: selected,
              tasks: tasks,
              onMonthChanged: (value) => setState(() => month = value),
              onDaySelected: (value) => setState(() => selected = value),
              onAdd: () => showTaskEditor(context, ref),
            )
          : _WeekPanel(
              selected: selected,
              tasks: tasks,
              blocksStream: ref
                  .read(repositoryProvider)
                  .watchScheduleBlocks(
                    selected.subtract(Duration(days: selected.weekday - 1)),
                    selected
                        .subtract(Duration(days: selected.weekday - 1))
                        .add(const Duration(days: 7)),
                  ),
              onSelectedChanged: (value) => setState(() => selected = value),
            ),
    );
  }
}

class _MonthPanel extends StatelessWidget {
  const _MonthPanel({
    required this.month,
    required this.selected,
    required this.tasks,
    required this.onMonthChanged,
    required this.onDaySelected,
    required this.onAdd,
  });

  final DateTime month;
  final DateTime selected;
  final List<Task> tasks;
  final ValueChanged<DateTime> onMonthChanged;
  final ValueChanged<DateTime> onDaySelected;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final first = DateTime(month.year, month.month, 1);
    final days = DateTime(month.year, month.month + 1, 0).day;
    final cells = <DateTime?>[
      ...List<DateTime?>.filled(first.weekday - 1, null),
      ...List.generate(
        days,
        (index) => DateTime(month.year, month.month, index + 1),
      ),
    ];
    while (cells.length % 7 != 0) {
      cells.add(null);
    }
    final selectedTasks = tasks
        .where(
          (task) =>
              task.dueAt != null &&
              DateUtils.isSameDay(task.dueAt!.toLocal(), selected),
        )
        .toList();
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                IconButton(
                  tooltip: '上个月',
                  onPressed: () =>
                      onMonthChanged(DateTime(month.year, month.month - 1)),
                  icon: const Icon(Icons.chevron_left),
                ),
                Text(
                  DateFormat('yyyy年M月').format(month),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                IconButton(
                  tooltip: '下个月',
                  onPressed: () =>
                      onMonthChanged(DateTime(month.year, month.month + 1)),
                  icon: const Icon(Icons.chevron_right),
                ),
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: () {
                    final now = DateTime.now();
                    onMonthChanged(DateTime(now.year, now.month));
                    onDaySelected(DateUtils.dateOnly(now));
                  },
                  child: const Text('今天'),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Row(
            children: ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
                .map(
                  (day) => Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Center(
                        child: Text(
                          day,
                          style: const TextStyle(
                            color: ZhixuColors.muted,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          const Divider(height: 1),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: cells.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 1.42,
            ),
            itemBuilder: (context, index) {
              final day = cells[index];
              if (day == null) return const _BlankDayCell();
              final dayTasks = tasks
                  .where(
                    (task) =>
                        task.dueAt != null &&
                        DateUtils.isSameDay(task.dueAt!.toLocal(), day),
                  )
                  .toList();
              return _DayCell(
                day: day,
                tasks: dayTasks,
                selected: DateUtils.isSameDay(day, selected),
                onTap: () => onDaySelected(day),
              );
            },
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Text(
                  '${selected.month}月${selected.day}日安排',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(width: 8),
                Text(
                  '${selectedTasks.length} 项',
                  style: const TextStyle(color: ZhixuColors.muted),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: onAdd,
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('添加任务'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BlankDayCell extends StatelessWidget {
  const _BlankDayCell();

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      border: Border(
        right: BorderSide(color: Theme.of(context).dividerColor),
        bottom: BorderSide(color: Theme.of(context).dividerColor),
      ),
    ),
  );
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.tasks,
    required this.selected,
    required this.onTap,
  });

  final DateTime day;
  final List<Task> tasks;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final today = DateUtils.isSameDay(day, DateTime.now());
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: selected
              ? Theme.of(context).colorScheme.primaryContainer
              : null,
          border: Border(
            left: selected
                ? const BorderSide(color: ZhixuColors.accent, width: 2)
                : BorderSide.none,
            right: BorderSide(color: Theme.of(context).dividerColor),
            bottom: BorderSide(color: Theme.of(context).dividerColor),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 26,
              height: 26,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: today ? ZhixuColors.accent : null,
                shape: BoxShape.circle,
              ),
              child: Text(
                '${day.day}',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: today ? Colors.white : null,
                ),
              ),
            ),
            const SizedBox(height: 6),
            if (tasks.isNotEmpty)
              Text(
                '${tasks.length} 项任务',
                style: const TextStyle(color: ZhixuColors.muted, fontSize: 13),
              ),
            const SizedBox(height: 3),
            ...tasks
                .take(3)
                .map(
                  (task) => Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Container(
                      height: 5,
                      decoration: BoxDecoration(
                        color: priorityColor(task.priority),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class _WeekPanel extends StatelessWidget {
  const _WeekPanel({
    required this.selected,
    required this.tasks,
    required this.blocksStream,
    required this.onSelectedChanged,
  });

  final DateTime selected;
  final List<Task> tasks;
  final Stream<List<ScheduleBlock>> blocksStream;
  final ValueChanged<DateTime> onSelectedChanged;

  @override
  Widget build(BuildContext context) {
    final monday = selected.subtract(Duration(days: selected.weekday - 1));
    final end = monday.add(const Duration(days: 7));
    return Column(
      children: [
        SectionCard(
          child: Row(
            children: [
              IconButton(
                onPressed: () => onSelectedChanged(
                  selected.subtract(const Duration(days: 7)),
                ),
                icon: const Icon(Icons.chevron_left),
              ),
              Text(
                '${DateFormat('M月d日').format(monday)} - ${DateFormat('M月d日').format(end.subtract(const Duration(days: 1)))}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              IconButton(
                onPressed: () =>
                    onSelectedChanged(selected.add(const Duration(days: 7))),
                icon: const Icon(Icons.chevron_right),
              ),
              const Spacer(),
              OutlinedButton(
                onPressed: () =>
                    onSelectedChanged(DateUtils.dateOnly(DateTime.now())),
                child: const Text('本周'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        StreamBuilder<List<ScheduleBlock>>(
          stream: blocksStream,
          builder: (context, snapshot) {
            final blocks = snapshot.data ?? const <ScheduleBlock>[];
            return SectionCard(
              child: Column(
                children: List.generate(7, (index) {
                  final day = monday.add(Duration(days: index));
                  final dayTasks = tasks
                      .where(
                        (task) =>
                            task.dueAt != null &&
                            DateUtils.isSameDay(task.dueAt!.toLocal(), day),
                      )
                      .toList();
                  final dayBlocks = blocks
                      .where(
                        (block) =>
                            DateUtils.isSameDay(block.startAt.toLocal(), day),
                      )
                      .toList();
                  return _WeekDayRow(
                    day: day,
                    tasks: dayTasks,
                    blocks: dayBlocks,
                    showDivider: index < 6,
                  );
                }),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _WeekDayRow extends StatelessWidget {
  const _WeekDayRow({
    required this.day,
    required this.tasks,
    required this.blocks,
    required this.showDivider,
  });

  final DateTime day;
  final List<Task> tasks;
  final List<ScheduleBlock> blocks;
  final bool showDivider;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 84,
            child: Text(
              '${DateFormat('E', 'zh_CN').format(day)}\n${day.month}/${day.day}',
              style: TextStyle(
                color: DateUtils.isSameDay(day, DateTime.now())
                    ? ZhixuColors.accent
                    : ZhixuColors.muted,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (tasks.isEmpty && blocks.isEmpty)
                  const Text(
                    '无安排',
                    style: TextStyle(color: ZhixuColors.muted, fontSize: 13),
                  ),
                ...blocks.map((block) => _BlockRow(block: block)),
                ...tasks.map(
                  (task) => Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Row(
                      children: [
                        StatusPill(status: task.status),
                        const SizedBox(width: 8),
                        Expanded(child: Text(task.title)),
                        if (task.dueAt != null)
                          Text(
                            DateFormat('HH:mm').format(task.dueAt!.toLocal()),
                            style: const TextStyle(
                              color: ZhixuColors.muted,
                              fontSize: 13,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      if (showDivider) const Divider(height: 24),
    ],
  );
}

class _BlockRow extends StatelessWidget {
  const _BlockRow({required this.block});

  final ScheduleBlock block;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 5),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: ZhixuColors.accent.withValues(alpha: .13),
        border: const Border(
          left: BorderSide(color: ZhixuColors.accent, width: 3),
        ),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        children: [
          Text(
            '${DateFormat('HH:mm').format(block.startAt.toLocal())}-${DateFormat('HH:mm').format(block.endAt.toLocal())}',
            style: const TextStyle(color: ZhixuColors.accent, fontSize: 13),
          ),
          const SizedBox(width: 12),
          Text(block.title),
        ],
      ),
    ),
  );
}
