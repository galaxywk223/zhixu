import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../services/backup_service.dart';
import '../../services/sync_service.dart';
import '../../services/tomato_import_service.dart';
import '../../state/providers.dart';
import '../widgets/common.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = ref.watch(themeModeProvider);
    final sync = ref.watch(syncServiceProvider);
    return PageFrame(
      title: '设置',
      subtitle: '管理账户、同步、外观与本地数据。',
      actions: [
        if (sync.configured)
          FilledButton.icon(
            onPressed: sync.state == SyncState.syncing ? null : sync.syncNow,
            icon: const Icon(Icons.sync, size: 18),
            label: const Text('立即同步'),
          ),
      ],
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth > 920;
          final account = _AccountCard(sync: sync, ref: ref);
          final appearance = _AppearanceCard(theme: theme, ref: ref);
          final data = _DataCard(ref: ref);
          final about = _AboutCard(sync: sync);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: account),
                    const SizedBox(width: 14),
                    Expanded(child: appearance),
                  ],
                )
              else ...[
                account,
                const SizedBox(height: 14),
                appearance,
              ],
              const SizedBox(height: 14),
              if (wide)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: data),
                    const SizedBox(width: 14),
                    Expanded(child: about),
                  ],
                )
              else ...[
                data,
                const SizedBox(height: 14),
                about,
              ],
            ],
          );
        },
      ),
    );
  }
}

class _AccountCard extends StatelessWidget {
  const _AccountCard({required this.sync, required this.ref});

  final SyncService sync;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('账户与同步', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
          sync.configured
              ? (sync.user == null
                    ? '尚未登录，当前使用本地模式。'
                    : '已登录：${sync.user!.email ?? '账户'}')
              : '未配置 Supabase，当前使用本地模式。',
          style: const TextStyle(color: ZhixuColors.muted),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Icon(
              sync.state == SyncState.error
                  ? Icons.error_outline
                  : Icons.cloud_outlined,
              color: sync.state == SyncState.error
                  ? ZhixuColors.danger
                  : ZhixuColors.success,
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Text(
                _syncText(sync.state),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
            if (sync.user != null)
              OutlinedButton(onPressed: sync.signOut, child: const Text('退出'))
            else
              FilledButton(
                onPressed: sync.configured
                    ? () => _showSignIn(context, ref)
                    : null,
                child: const Text('登录'),
              ),
          ],
        ),
        if (sync.errorMessage != null) ...[
          const SizedBox(height: 8),
          Text(
            sync.errorMessage!,
            style: const TextStyle(color: ZhixuColors.danger, fontSize: 12),
          ),
        ],
      ],
    ),
  );
}

class _AppearanceCard extends StatelessWidget {
  const _AppearanceCard({required this.theme, required this.ref});

  final ThemeMode theme;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('主题外观', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        const Text(
          '深色主题作为主设计，同时支持浅色和跟随系统。',
          style: TextStyle(color: ZhixuColors.muted),
        ),
        const SizedBox(height: 16),
        SegmentedButton<ThemeMode>(
          segments: const [
            ButtonSegment(
              value: ThemeMode.dark,
              label: Text('深色'),
              icon: Icon(Icons.dark_mode_outlined),
            ),
            ButtonSegment(
              value: ThemeMode.light,
              label: Text('浅色'),
              icon: Icon(Icons.light_mode_outlined),
            ),
            ButtonSegment(
              value: ThemeMode.system,
              label: Text('跟随系统'),
              icon: Icon(Icons.brightness_auto_outlined),
            ),
          ],
          selected: {theme},
          onSelectionChanged: (value) =>
              ref.read(themeModeProvider.notifier).state = value.first,
        ),
      ],
    ),
  );
}

class _DataCard extends StatelessWidget {
  const _DataCard({required this.ref});

  final WidgetRef ref;

  @override
  Widget build(BuildContext context) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('数据与备份', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        const Text(
          '本地数据库是事实源，备份文件可在设备间迁移。',
          style: TextStyle(color: ZhixuColors.muted),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: () => _importTomato(context, ref),
              icon: const Icon(Icons.file_open_outlined, size: 18),
              label: const Text('导入番茄 TODO .xls'),
            ),
            OutlinedButton.icon(
              onPressed: () async {
                final file = await BackupService(
                  ref.read(repositoryProvider),
                ).exportBackup();
                if (file != null && context.mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text('备份已导出：${file.path}')));
                }
              },
              icon: const Icon(Icons.download_outlined, size: 18),
              label: const Text('导出备份'),
            ),
            OutlinedButton.icon(
              onPressed: () => _restoreBackup(context, ref),
              icon: const Icon(Icons.upload_outlined, size: 18),
              label: const Text('恢复备份'),
            ),
          ],
        ),
      ],
    ),
  );
}

class _AboutCard extends StatelessWidget {
  const _AboutCard({required this.sync});

  final SyncService sync;

  @override
  Widget build(BuildContext context) => SectionCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('关于知序', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        const Text('知序 0.1.0', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 5),
        const Text(
          '本地优先的任务与学习规划工作台。',
          style: TextStyle(color: ZhixuColors.muted),
        ),
        const SizedBox(height: 15),
        const Row(
          children: [
            Icon(
              Icons.desktop_windows_outlined,
              color: ZhixuColors.muted,
              size: 18,
            ),
            SizedBox(width: 8),
            Text('Windows 桌面端首发'),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            const Icon(
              Icons.security_outlined,
              color: ZhixuColors.muted,
              size: 18,
            ),
            const SizedBox(width: 8),
            Text(
              sync.configured ? 'Supabase 同步已配置' : '本地模式',
              style: const TextStyle(color: ZhixuColors.muted),
            ),
          ],
        ),
      ],
    ),
  );
}

String _syncText(SyncState state) => switch (state) {
  SyncState.unavailable => '本地模式',
  SyncState.signedOut => '未登录',
  SyncState.idle => '数据已同步',
  SyncState.syncing => '同步中...',
  SyncState.error => '同步失败',
};

Future<void> _showSignIn(BuildContext context, WidgetRef ref) async {
  final email = TextEditingController();
  final password = TextEditingController();
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('登录知序账户'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: '邮箱'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: '密码'),
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
            try {
              await ref
                  .read(syncServiceProvider)
                  .signIn(email.text.trim(), password.text);
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            } catch (error) {
              if (context.mounted) {
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text('登录失败：$error')));
              }
            }
          },
          child: const Text('登录'),
        ),
      ],
    ),
  );
  email.dispose();
  password.dispose();
}

Future<void> _importTomato(BuildContext context, WidgetRef ref) async {
  try {
    final service = TomatoImportService();
    final data = await service.pickAndPreview();
    if (data == null || !context.mounted) return;
    final shouldImport = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('确认导入番茄记录'),
        content: SizedBox(
          width: 480,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('文件：${data.filePath.split(Platform.pathSeparator).last}'),
              const SizedBox(height: 8),
              Text('导出用户：${data.exportUser ?? '未知'}'),
              Text('记录数：${data.sessions.length}'),
              Text('声明专注：${data.declaredMinutes ?? 0} 分钟'),
              const SizedBox(height: 14),
              const Text(
                '重复记录会自动跳过，零分钟记录会保留但不计入时长统计。',
                style: TextStyle(color: ZhixuColors.muted),
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
            child: const Text('确认导入'),
          ),
        ],
      ),
    );
    if (shouldImport != true || !context.mounted) return;
    final result = await service.confirm(ref.read(repositoryProvider), data);
    refreshCore(ref);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '导入完成：新增 ${result.importedCount}，更新 ${result.updatedCount}，跳过 ${result.skippedCount}',
          ),
        ),
      );
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('导入失败：$error')));
    }
  }
}

Future<void> _restoreBackup(BuildContext context, WidgetRef ref) async {
  final result = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: ['zip'],
  );
  final path = result?.files.single.path;
  if (path == null || !context.mounted) return;
  final confirm = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('恢复备份'),
      content: const Text('恢复会覆盖当前本地任务、项目、笔记和专注记录。此操作不可撤销，请先导出当前备份。'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          child: const Text('继续恢复'),
        ),
      ],
    ),
  );
  if (confirm != true) return;
  try {
    await BackupService(ref.read(repositoryProvider)).restoreBackup(File(path));
    refreshCore(ref);
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('备份已恢复')));
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('恢复失败：$error')));
    }
  }
}
