import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zhixu/app.dart';
import 'package:zhixu/core/theme.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/data/repository.dart';
import 'package:zhixu/services/update_service.dart';
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
    expect(theme.textTheme.headlineMedium?.fontSize, 26);
    expect(theme.textTheme.bodyMedium?.fontFamily, 'Noto Sans SC');
  });

  testWidgets('应用根节点提供中文 Material 本地化', (tester) async {
    final database = ZhixuDatabase.memory();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWithValue(database),
          updateServiceProvider.overrideWith((ref) => _NoopUpdateService()),
        ],
        child: const ZhixuApp(),
      ),
    );
    await tester.pumpAndSettle();

    final context = tester.element(find.byType(AppShell));
    expect(Localizations.localeOf(context), const Locale('zh', 'CN'));
    expect(MaterialLocalizations.of(context).cancelButtonLabel, '取消');

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
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

  testWidgets('任务管理页支持分组筛选、完成切换和完整编辑', (tester) async {
    await tester.binding.setSurfaceSize(const Size(1586, 992));
    final database = ZhixuDatabase.memory();
    final repository = ZhixuRepository(database, deviceId: 'widget-test');
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    await repository.importFocusSessions(
      fileName: 'history.xls',
      fileHash: 'widget-hash',
      sessions: [
        ImportedFocusSession(
          sourceKey: 'focus-category',
          startAt: today.add(const Duration(hours: 9)),
          endAt: today.add(const Duration(hours: 10)),
          taskName: '项目开发',
          durationMinutes: 60,
          status: '已完成',
        ),
      ],
    );
    final category = (await repository.taskCategories()).single;
    final tagId = await repository.createTag('重要', '#B42318');
    final todayTaskId = await repository.createTask(
      TaskDraft(
        title: '实现分类筛选',
        categoryId: category.id,
        tagIds: {tagId},
        estimatedMinutes: 60,
        dueAt: today.add(const Duration(hours: 18)),
      ),
    );
    final tomorrowTaskId = await repository.createTask(
      TaskDraft(
        title: '整理明日计划',
        estimatedMinutes: 30,
        dueAt: today.add(const Duration(days: 1, hours: 9)),
      ),
    );
    final completedTaskId = await repository.createTask(
      const TaskDraft(title: '已归档的完成事项'),
    );
    await repository.setTaskStatus(completedTaskId, 'done');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [databaseProvider.overrideWithValue(database)],
        child: MaterialApp(
          locale: const Locale('zh', 'CN'),
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          supportedLocales: const [Locale('zh', 'CN')],
          theme: buildZhixuTheme(brightness: Brightness.light),
          home: const Scaffold(body: TasksPage()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('任务管理'), findsOneWidget);
    expect(find.text('任务总数'), findsOneWidget);
    expect(find.text('今日到期'), findsOneWidget);
    expect(find.text('本周完成'), findsOneWidget);
    expect(find.byKey(const Key('task-table')), findsOneWidget);
    expect(find.byKey(const Key('task-view-active')), findsOneWidget);
    expect(find.byKey(Key('task-row-$todayTaskId')), findsOneWidget);
    expect(find.byKey(Key('task-row-$completedTaskId')), findsNothing);
    expect(find.text('项目开发'), findsWidgets);
    expect(find.text('重要'), findsWidgets);
    expect(find.text('今天'), findsWidgets);
    expect(find.text('明天'), findsWidgets);

    await tester.tap(find.byKey(const Key('task-filter-toggle')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('task-filter-panel')), findsOneWidget);
    expect(find.text('重置筛选'), findsOneWidget);

    await tester.tap(find.byKey(const Key('task-view-all')));
    await tester.pumpAndSettle();
    expect(find.byKey(Key('task-row-$completedTaskId')), findsOneWidget);

    await tester.tap(find.byKey(Key('task-category-${category.id}')));
    await tester.pumpAndSettle();
    expect(find.byKey(Key('task-row-$todayTaskId')), findsOneWidget);
    expect(find.text('整理明日计划'), findsNothing);

    await tester.tap(find.byKey(const Key('task-category-all')));
    await tester.tap(find.byKey(Key('task-tag-$tagId')));
    await tester.pumpAndSettle();
    expect(find.byKey(Key('task-row-$todayTaskId')), findsOneWidget);
    expect(find.text('整理明日计划'), findsNothing);

    await tester.tap(find.byKey(const Key('task-tag-all')));
    await tester.enterText(
      find.byKey(const Key('task-search-field')),
      '整理明日计划',
    );
    await tester.pumpAndSettle();
    expect(find.byKey(Key('task-row-$tomorrowTaskId')), findsOneWidget);
    expect(find.text('实现分类筛选'), findsNothing);
    await tester.enterText(find.byKey(const Key('task-search-field')), '');
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(Key('task-complete-$todayTaskId')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<Checkbox>(find.byKey(Key('task-complete-$todayTaskId')))
          .value,
      isTrue,
    );

    await tester.tap(find.byKey(Key('task-row-$todayTaskId')));
    await tester.pumpAndSettle();
    expect(find.text('编辑任务'), findsOneWidget);
    expect(find.text('分类与标签'), findsOneWidget);
    expect(find.text('计划与到期安排'), findsOneWidget);
    expect(find.text('新建标签'), findsOneWidget);
    expect(find.text('15 分钟'), findsOneWidget);
    expect(find.text('到期时间'), findsWidgets);

    await tester.tap(find.text('选择时间'));
    await tester.pumpAndSettle();
    expect(find.byType(DatePickerDialog), findsOneWidget);
    final datePickerCancel = find.descendant(
      of: find.byType(DatePickerDialog),
      matching: find.text('取消'),
    );
    expect(datePickerCancel, findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(datePickerCancel);
    await tester.pumpAndSettle();

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await database.close();
    await tester.binding.setSurfaceSize(null);
  });

  testWidgets('任务管理页在目标桌面尺寸下不产生布局异常', (tester) async {
    final database = ZhixuDatabase.memory();
    final router = GoRouter(
      initialLocation: '/tasks',
      routes: [
        GoRoute(
          path: '/tasks',
          builder: (_, _) => const AppShell(child: TasksPage()),
        ),
      ],
    );
    await database
        .into(database.tasks)
        .insert(
          TasksCompanion.insert(
            id: 'responsive-task',
            title: '用于检查任务表格列宽和响应式折叠的长任务标题',
            descriptionMd: const Value('响应式布局测试'),
            priority: const Value(3),
            dueAt: Value(DateTime.now().add(const Duration(hours: 2))),
            estimatedMinutes: const Value(120),
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
            deviceId: 'widget-test',
          ),
        );

    for (final brightness in Brightness.values) {
      for (final size in const [
        Size(1366, 768),
        Size(1586, 992),
        Size(1920, 1080),
      ]) {
        await tester.binding.setSurfaceSize(size);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [databaseProvider.overrideWithValue(database)],
            child: MaterialApp.router(
              theme: buildZhixuTheme(brightness: brightness),
              routerConfig: router,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          tester.takeException(),
          isNull,
          reason: '${brightness.name} ${size.width}x${size.height}',
        );
        expect(find.byKey(const Key('task-table')), findsOneWidget);
      }
    }

    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await database.close();
    router.dispose();
    await tester.binding.setSurfaceSize(null);
  });
}

class _NoopUpdateService extends UpdateService {
  @override
  Future<void> autoCheck() async {}
}
