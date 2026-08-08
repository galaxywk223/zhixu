import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';

class FocusPage extends ConsumerStatefulWidget {
  const FocusPage({super.key});

  @override
  ConsumerState<FocusPage> createState() => _FocusPageState();
}

class _FocusPageState extends ConsumerState<FocusPage> {
  String range = '30';
  String query = '';

  @override
  Widget build(BuildContext context) {
    final sessions =
        ref.watch(focusSessionsProvider).valueOrNull ?? const <FocusSession>[];
    final batches =
        ref.watch(importBatchesProvider).valueOrNull ?? const <ImportBatche>[];
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    int minutesSince(Duration duration) => sessions
        .where((row) => row.startAt.toLocal().isAfter(now.subtract(duration)))
        .fold(0, (sum, row) => sum + row.durationMinutes.clamp(0, 1 << 30));
    final visible = sessions.where((row) {
      final local = row.startAt.toLocal();
      final matchesRange = switch (range) {
        'today' => !local.isBefore(todayStart),
        '7' => local.isAfter(now.subtract(const Duration(days: 7))),
        '30' => local.isAfter(now.subtract(const Duration(days: 30))),
        _ => true,
      };
      return matchesRange &&
          (query.trim().isEmpty ||
              row.taskName.toLowerCase().contains(query.trim().toLowerCase()));
    }).toList();

    return PageFrame(
      title: '专注',
      subtitle: '独立统计番茄 TODO 的投入时间，不会创建或修改待办。',
      actions: [
        SizedBox(
          width: 230,
          child: TextField(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search, size: 18),
              hintText: '筛选专注事项...',
            ),
            onChanged: (value) => setState(() => query = value),
          ),
        ),
      ],
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
              childAspectRatio: constraints.maxWidth > 900 ? 2.7 : 4.5,
              children: [
                MetricCard(
                  label: '今日专注',
                  value: '${minutesSince(now.difference(todayStart))} 分钟',
                  icon: Icons.today_outlined,
                  color: ZhixuColors.accent,
                ),
                MetricCard(
                  label: '近 7 天',
                  value: '${minutesSince(const Duration(days: 7))} 分钟',
                  icon: Icons.date_range_outlined,
                  color: ZhixuColors.success,
                ),
                MetricCard(
                  label: '近 30 天',
                  value: '${minutesSince(const Duration(days: 30))} 分钟',
                  icon: Icons.timer_outlined,
                  color: ZhixuColors.warning,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'today', label: Text('今天')),
              ButtonSegment(value: '7', label: Text('近 7 天')),
              ButtonSegment(value: '30', label: Text('近 30 天')),
              ButtonSegment(value: 'all', label: Text('全部')),
            ],
            selected: {range},
            onSelectionChanged: (value) => setState(() => range = value.single),
          ),
          const SizedBox(height: 14),
          LayoutBuilder(
            builder: (context, constraints) {
              final details = _FocusDetails(sessions: visible);
              final imports = _ImportHistory(
                batches: batches,
                onRollback: _rollback,
              );
              if (constraints.maxWidth > 1080) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 3, child: details),
                    const SizedBox(width: 14),
                    SizedBox(width: 330, child: imports),
                  ],
                );
              }
              return Column(
                children: [details, const SizedBox(height: 14), imports],
              );
            },
          ),
        ],
      ),
    );
  }

  Future<void> _rollback(ImportBatche batch) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('撤销导入批次'),
        content: Text('将撤销 ${batch.fileName} 对本地数据产生的变更。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('确认撤销'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(repositoryProvider).rollbackImportBatch(batch.id);
    refreshCore(ref);
  }
}

class _FocusDetails extends StatelessWidget {
  const _FocusDetails({required this.sessions});

  final List<FocusSession> sessions;

  @override
  Widget build(BuildContext context) => SectionCard(
    padding: const EdgeInsets.fromLTRB(20, 20, 20, 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('专注明细', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 14),
        if (sessions.isEmpty)
          const EmptyState(
            icon: Icons.timer_outlined,
            title: '暂无专注记录',
            message: '从设置导入番茄 TODO 历史后，记录会显示在这里。',
          )
        else
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 44,
              dataRowMinHeight: 54,
              dataRowMaxHeight: 68,
              horizontalMargin: 8,
              columnSpacing: 24,
              columns: const [
                DataColumn(label: Text('时间')),
                DataColumn(label: Text('专注事项')),
                DataColumn(label: Text('时长')),
                DataColumn(label: Text('状态')),
                DataColumn(label: Text('心得')),
              ],
              rows: sessions
                  .map(
                    (row) => DataRow(
                      cells: [
                        DataCell(
                          SizedBox(
                            width: 128,
                            child: Text(
                              '${DateFormat('MM-dd HH:mm').format(row.startAt.toLocal())}\n'
                              '至 ${DateFormat('HH:mm').format(row.endAt.toLocal())}',
                            ),
                          ),
                        ),
                        DataCell(
                          SizedBox(
                            width: 180,
                            child: Text(
                              row.taskName,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        DataCell(
                          Text(
                            '${row.durationMinutes} 分钟',
                            style: const TextStyle(
                              color: ZhixuColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        DataCell(Text(row.status.isEmpty ? '未记录' : row.status)),
                        DataCell(
                          SizedBox(
                            width: 210,
                            child: Text(
                              row.reflection?.trim().isNotEmpty == true
                                  ? row.reflection!
                                  : '—',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
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

class _ImportHistory extends StatelessWidget {
  const _ImportHistory({required this.batches, required this.onRollback});

  final List<ImportBatche> batches;
  final ValueChanged<ImportBatche> onRollback;

  @override
  Widget build(BuildContext context) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('导入批次', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (batches.isEmpty)
          const Text('暂无导入批次', style: TextStyle(color: ZhixuColors.muted))
        else
          ...batches
              .take(8)
              .map(
                (batch) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    batch.fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    '${DateFormat('MM-dd HH:mm').format(batch.createdAt.toLocal())}  '
                    '${batch.importedCount} 条',
                  ),
                  trailing: batch.rolledBackAt != null
                      ? const Text(
                          '已撤销',
                          style: TextStyle(color: ZhixuColors.muted),
                        )
                      : IconButton(
                          tooltip: '撤销批次',
                          icon: const Icon(Icons.undo, size: 18),
                          onPressed: () => onRollback(batch),
                        ),
                ),
              ),
      ],
    ),
  );
}
