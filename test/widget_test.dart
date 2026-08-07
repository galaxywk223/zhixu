import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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
    expect(find.byTooltip('专题'), findsOneWidget);
    expect(find.text('页面内容'), findsOneWidget);
  });
}
