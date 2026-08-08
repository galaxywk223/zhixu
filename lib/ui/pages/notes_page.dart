import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../data/database.dart';
import '../../data/repository.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';

class NotesPage extends ConsumerStatefulWidget {
  const NotesPage({super.key});

  @override
  ConsumerState<NotesPage> createState() => _NotesPageState();
}

class _NotesPageState extends ConsumerState<NotesPage> {
  String? selectedId;
  late final TextEditingController titleController;
  late final TextEditingController contentController;
  bool preview = false;
  bool dirty = false;
  String query = '';

  @override
  void initState() {
    super.initState();
    titleController = TextEditingController();
    contentController = TextEditingController();
    titleController.addListener(_markDirty);
    contentController.addListener(_markDirty);
  }

  void _markDirty() {
    if (mounted) setState(() => dirty = true);
  }

  @override
  void dispose() {
    titleController.dispose();
    contentController.dispose();
    super.dispose();
  }

  void selectNote(Note note) {
    setState(() {
      selectedId = note.id;
      titleController.text = note.title;
      contentController.text = note.contentMd;
      dirty = false;
    });
  }

  Future<void> save() async {
    if (selectedId == null || titleController.text.trim().isEmpty) return;
    await ref
        .read(repositoryProvider)
        .updateNote(
          selectedId!,
          NoteDraft(
            title: titleController.text,
            contentMd: contentController.text,
          ),
        );
    if (mounted) setState(() => dirty = false);
    refreshCore(ref);
  }

  @override
  Widget build(BuildContext context) {
    final notes = ref.watch(notesProvider).valueOrNull ?? const <Note>[];
    final visibleNotes = notes.where((note) {
      final needle = query.trim().toLowerCase();
      return needle.isEmpty ||
          note.title.toLowerCase().contains(needle) ||
          note.contentMd.toLowerCase().contains(needle);
    }).toList();
    final selected = notes.where((note) => note.id == selectedId).firstOrNull;
    if (selected == null && notes.isNotEmpty && selectedId == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) selectNote(notes.first);
      });
    }
    return PageFrame(
      title: '笔记',
      subtitle: '记录灵感、整理知识、沉淀学习内容。',
      actions: [
        FilledButton.icon(
          onPressed: () async {
            final id = await ref
                .read(repositoryProvider)
                .createNote(const NoteDraft(title: '未命名笔记'));
            setState(() {
              selectedId = id;
              titleController.text = '未命名笔记';
              contentController.text = '';
              dirty = false;
            });
            refreshCore(ref);
          },
          icon: const Icon(Icons.add, size: 18),
          label: const Text('新建笔记'),
        ),
      ],
      child: SizedBox(
        height: 650,
        child: Card(
          child: Row(
            children: [
              SizedBox(
                width: 310,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(14),
                      child: TextField(
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search, size: 18),
                          hintText: '搜索笔记...',
                        ),
                        onChanged: (value) => setState(() => query = value),
                      ),
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: visibleNotes.isEmpty
                          ? const EmptyState(
                              icon: Icons.edit_note_outlined,
                              title: '暂无笔记',
                              message: '新建一篇笔记，开始沉淀内容。',
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.all(10),
                              itemCount: visibleNotes.length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(height: 6),
                              itemBuilder: (context, index) => _NoteListItem(
                                note: visibleNotes[index],
                                active: visibleNotes[index].id == selectedId,
                                onTap: () => selectNote(visibleNotes[index]),
                              ),
                            ),
                    ),
                  ],
                ),
              ),
              const VerticalDivider(width: 1),
              Expanded(
                child: selected == null
                    ? const EmptyState(
                        icon: Icons.article_outlined,
                        title: '选择一篇笔记',
                        message: '左侧选择笔记，右侧进行编辑。',
                      )
                    : Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(18, 13, 12, 10),
                            child: Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: titleController,
                                    style: const TextStyle(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w700,
                                    ),
                                    decoration: const InputDecoration(
                                      border: InputBorder.none,
                                      hintText: '笔记标题',
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: preview ? '编辑' : '预览',
                                  icon: Icon(
                                    preview
                                        ? Icons.edit_outlined
                                        : Icons.visibility_outlined,
                                  ),
                                  onPressed: () =>
                                      setState(() => preview = !preview),
                                ),
                                FilledButton(
                                  onPressed: dirty ? save : null,
                                  child: const Text('保存'),
                                ),
                              ],
                            ),
                          ),
                          const Divider(height: 1),
                          Expanded(
                            child: preview
                                ? Markdown(
                                    data: contentController.text.isEmpty
                                        ? '*暂无内容*'
                                        : contentController.text,
                                    padding: const EdgeInsets.all(24),
                                  )
                                : Padding(
                                    padding: const EdgeInsets.all(18),
                                    child: TextField(
                                      controller: contentController,
                                      maxLines: null,
                                      expands: true,
                                      textAlignVertical: TextAlignVertical.top,
                                      decoration: const InputDecoration(
                                        border: InputBorder.none,
                                        hintText: '使用 Markdown 记录内容...',
                                      ),
                                    ),
                                  ),
                          ),
                          const Divider(height: 1),
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 8,
                            ),
                            child: Row(
                              children: [
                                const Text(
                                  'Markdown',
                                  style: TextStyle(
                                    color: ZhixuColors.muted,
                                    fontSize: 13,
                                  ),
                                ),
                                const Spacer(),
                                Text(
                                  '${contentController.text.length} 字符',
                                  style: const TextStyle(
                                    color: ZhixuColors.muted,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
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

class _NoteListItem extends StatelessWidget {
  const _NoteListItem({
    required this.note,
    required this.active,
    required this.onTap,
  });

  final Note note;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(6),
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: active
            ? Theme.of(context).colorScheme.primaryContainer
            : Colors.transparent,
        borderRadius: BorderRadius.circular(6),
        border: active
            ? Border.all(color: ZhixuColors.accent.withValues(alpha: .5))
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (note.isPinned)
                const Icon(
                  Icons.push_pin,
                  size: 13,
                  color: ZhixuColors.warning,
                ),
              if (note.isPinned) const SizedBox(width: 5),
              Expanded(
                child: Text(
                  note.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            note.contentMd.replaceAll('\n', ' '),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: ZhixuColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 7),
          Text(
            _relative(note.updatedAt),
            style: const TextStyle(color: ZhixuColors.muted, fontSize: 13),
          ),
        ],
      ),
    ),
  );
}

String _relative(DateTime value) {
  final diff = DateTime.now().difference(value.toLocal());
  if (diff.inMinutes < 1) return '刚刚';
  if (diff.inHours < 1) return '${diff.inMinutes} 分钟前';
  if (diff.inDays < 1) return '${diff.inHours} 小时前';
  return '${value.month}月${value.day}日';
}
