import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/state/providers.dart';
import 'package:zhixu/ui/pages/focus_page.dart';
import 'package:zhixu/ui/pages/sleep_page.dart';
import 'package:zhixu/ui/shell.dart';

void main() {
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

    expect(find.byIcon(Icons.auto_awesome), findsOneWidget);
    expect(find.byIcon(Icons.wb_sunny_outlined), findsOneWidget);
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
}
