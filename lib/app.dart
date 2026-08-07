import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/theme.dart';
import 'state/providers.dart';
import 'ui/pages/calendar_page.dart';
import 'ui/pages/notes_page.dart';
import 'ui/pages/projects_page.dart';
import 'ui/pages/settings_page.dart';
import 'ui/pages/stats_page.dart';
import 'ui/pages/tasks_page.dart';
import 'ui/pages/today_page.dart';
import 'ui/shell.dart';

class ZhixuApp extends ConsumerStatefulWidget {
  const ZhixuApp({super.key});

  @override
  ConsumerState<ZhixuApp> createState() => _ZhixuAppState();
}

class _ZhixuAppState extends ConsumerState<ZhixuApp> {
  @override
  void initState() {
    super.initState();
    Future<void>.microtask(ref.read(updateServiceProvider).autoCheck);
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(themeModeProvider);
    final router = GoRouter(
      initialLocation: '/today',
      routes: [
        ShellRoute(
          builder: (context, state, child) => AppShell(child: child),
          routes: [
            GoRoute(path: '/today', builder: (_, _) => const TodayPage()),
            GoRoute(path: '/tasks', builder: (_, _) => const TasksPage()),
            GoRoute(path: '/calendar', builder: (_, _) => const CalendarPage()),
            GoRoute(path: '/notes', builder: (_, _) => const NotesPage()),
            GoRoute(path: '/projects', builder: (_, _) => const ProjectsPage()),
            GoRoute(path: '/stats', builder: (_, _) => const StatsPage()),
            GoRoute(path: '/settings', builder: (_, _) => const SettingsPage()),
          ],
        ),
      ],
    );
    return MaterialApp.router(
      title: '知序',
      debugShowCheckedModeBanner: false,
      theme: buildZhixuTheme(brightness: Brightness.light),
      darkTheme: buildZhixuTheme(brightness: Brightness.dark),
      themeMode: mode,
      routerConfig: router,
    );
  }
}
