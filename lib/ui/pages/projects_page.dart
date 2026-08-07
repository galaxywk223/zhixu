import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';
import '../widgets/dialogs.dart';

class ProjectsPage extends ConsumerWidget {
  const ProjectsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects =
        ref.watch(projectsProvider).valueOrNull ?? const <Project>[];
    final tasks = ref.watch(tasksProvider).valueOrNull ?? const <Task>[];
    return PageFrame(
      title: '专题',
      subtitle: '围绕一个目标，把任务、日程和笔记放在一起。',
      actions: [
        FilledButton.icon(
          onPressed: () => showProjectEditor(context, ref),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('新建专题'),
        ),
      ],
      child: projects.isEmpty
          ? SectionCard(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 22),
              child: EmptyState(
                icon: Icons.folder_open_outlined,
                title: '暂无专题',
                message: '创建一个专题，把相关任务、日程和笔记放在一起。',
                action: FilledButton.icon(
                  onPressed: () => showProjectEditor(context, ref),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('创建专题'),
                ),
              ),
            )
          : LayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.maxWidth > 1100
                    ? 3
                    : constraints.maxWidth > 700
                    ? 2
                    : 1;
                return GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: columns,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.55,
                  children: projects.map((project) {
                    final related = tasks
                        .where((task) => task.projectId == project.id)
                        .toList();
                    final done = related
                        .where((task) => task.status == 'done')
                        .length;
                    final progress = related.isEmpty
                        ? 0.0
                        : done / related.length;
                    return SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 9,
                                height: 9,
                                decoration: BoxDecoration(
                                  color: _parseColor(project.colorHex),
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  project.name,
                                  style: Theme.of(
                                    context,
                                  ).textTheme.titleMedium,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              PopupMenuButton<String>(
                                onSelected: (value) async {
                                  if (value == 'delete') {
                                    await ref
                                        .read(repositoryProvider)
                                        .deleteProject(project.id);
                                    refreshCore(ref);
                                  }
                                },
                                itemBuilder: (_) => const [
                                  PopupMenuItem(
                                    value: 'delete',
                                    child: Text('删除专题'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          const Spacer(),
                          Text(
                            '$done / ${related.length} 项任务完成',
                            style: const TextStyle(
                              color: ZhixuColors.muted,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(height: 8),
                          LinearProgressIndicator(
                            value: progress,
                            minHeight: 6,
                            borderRadius: BorderRadius.circular(4),
                            color: _parseColor(project.colorHex),
                          ),
                          if (project.targetDate != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              '目标日期：${project.targetDate!.year}-${project.targetDate!.month}-${project.targetDate!.day}',
                              style: const TextStyle(
                                color: ZhixuColors.muted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  }).toList(),
                );
              },
            ),
    );
  }
}

Color _parseColor(String value) {
  final normalized = value.replaceFirst('#', '');
  return Color(int.parse('FF$normalized', radix: 16));
}
