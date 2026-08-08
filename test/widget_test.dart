import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zhixu/core/theme.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/data/repository.dart';
import 'package:zhixu/state/providers.dart';
import 'package:zhixu/ui/pages/focus_page.dart';
import 'package:zhixu/ui/pages/sleep_page.dart';
import 'package:zhixu/ui/pages/tasks_page.dart';
import 'package:zhixu/ui/shell.dart';

void main() {
  test('主题使用可读的 Noto Sans SC 字号体系', () {
    final theme = buildZhixuTheme(brightness: Brightness.light);
    expect(theme.textTheme.bodyMedium?.fontSize, 15);
    expect(theme.textTheme.bodySmall?.fontSize, 13);
    expect(theme.textTheme.headlineMedium?.fontSize, 27);
    expect(theme.textTheme.bodyMedium?.fontFamily, 'Noto Sans SC');
  });

  testWidgets('应用 shell 可以启动', (tester) async {
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, _) => const AppShell(child: Text('页面内容')),
        ),
      ],
    );
    await tester.pumpWidget(
      MaterialApp.router(theme: ThemeData.light(), routerConfig: router),
    );
    await tester.pump();

    expect(find.byKey(const Key('zhixu-brand-mark')), findsOneWidget);
    expect(find.byIcon(Icons.today_outlined), findsOneWidget);
    expect(find.byTooltip('专注'), findsOneWidget);
    expect(find.byTooltip('睡眠'), findsOneWidget);
    expect(find.byTooltip('专题'), findsNothing);
    expect(find.text('页面内容'), findsOneWidget);
  });

  testWidgets('专注和睡眠页展示空数据状态', (tester) async {
    await tester.binding.setSurfaceSize(const Size(1400, 900));
    final database = ZhixuDatabase.memory();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [databaseProvider.overrideWithValue(database)],
        child: const MaterialApp(home: Scaffold(body: FocusPage())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('暂无专注记录'), findsOneWidget);
    expect(find.text('导入批次'), findsOneWidget);
    expect(find.byIcon(Icons.link), findsNothing);
    expect(find.byIcon(Icons.link_off), findsNothing);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [databaseProvider.overrideWithValue(ZhixuDatabase.memory())],
        child: const MaterialApp(home: Scaffold(body: SleepPage())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('暂无睡眠记录'), findsOneWidget);
    expect(find.text('生活事件'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('任务页展示分类标签并开放完整编辑字段', (tester) async {
    await tester.binding.setSurfaceSize(const Size(1500, 950));
    final database = ZhixuDatabase.memory();
    final repository = ZhixuRepository(database, deviceId: 'widget-test');
    await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'widget-hash',
      sessions: [
        ImportedFocusSession(
          sourceKey: 'focus-category',
          startAt: DateTime(2026, 8, 8, 9),
          endAt: DateTime(2026, 8, 8, 10),
          taskName: '项目开发',
          durationMinutes: 60,
          status: '已完成',
        ),
      ],
    );
    final category = (await repository.taskCategories()).single;
    final tagId = await repository.createTag('重要', '#B42318');
    await repository.createTask(
      TaskDraft(
        title: '实现分类筛选',
        categoryId: category.id,
        tagIds: {tagId},
        estimatedMinutes: 60,
        dueAt: DateTime(2026, 8, 9, 18),
      ),
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [databaseProvider.overrideWithValue(database)],
        child: const MaterialApp(home: Scaffold(body: TasksPage())),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('实现分类筛选'), findsOneWidget);
    expect(find.text('项目开发'), findsWidgets);
    expect(find.text('重要'), findsWidgets);
    expect(find.byTooltip('编辑'), findsOneWidget);

    await tester.tap(find.byTooltip('编辑'));
    await tester.pumpAndSettle();
    expect(find.text('编辑任务'), findsOneWidget);
    expect(find.text('组织'), findsOneWidget);
    expect(find.text('计划'), findsOneWidget);
    expect(find.text('新建标签'), findsOneWidget);
    expect(find.text('15 分钟'), findsOneWidget);
    expect(find.text('到期时间'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await database.close();
    await tester.binding.setSurfaceSize(null);
  });
}
