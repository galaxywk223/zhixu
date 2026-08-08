import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/database.dart';
import '../data/repository.dart';
import '../services/sync_service.dart';
import '../services/update_service.dart';

final databaseProvider = Provider<ZhixuDatabase>((ref) {
  throw StateError('databaseProvider must be overridden by main()');
});

final repositoryProvider = Provider<ZhixuRepository>((ref) {
  final repository = ZhixuRepository(ref.watch(databaseProvider));
  ref.onDispose(repository.db.close);
  return repository;
});

class ThemeModeController extends StateNotifier<ThemeMode> {
  ThemeModeController() : super(ThemeMode.system) {
    _load();
  }

  static const _preferenceKey = 'theme_mode';

  Future<void> _load() async {
    final value = (await SharedPreferences.getInstance()).getString(
      _preferenceKey,
    );
    state = switch (value) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    await (await SharedPreferences.getInstance()).setString(
      _preferenceKey,
      mode.name,
    );
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeController, ThemeMode>(
  (ref) => ThemeModeController(),
);

final syncServiceProvider = ChangeNotifierProvider<SyncService>((ref) {
  return SyncService(ref.watch(repositoryProvider));
});

final updateServiceProvider = ChangeNotifierProvider<UpdateService>((ref) {
  return UpdateService();
});

final selectedNavigationProvider = StateProvider<int>((ref) => 0);

final tasksProvider = StreamProvider<List<Task>>((ref) {
  return ref.watch(repositoryProvider).watchTasks();
});

final taskCategoriesProvider = StreamProvider<List<TaskCategory>>((ref) {
  return ref.watch(repositoryProvider).watchTaskCategories();
});

final tagsProvider = StreamProvider<List<Tag>>((ref) {
  return ref.watch(repositoryProvider).watchTags();
});

final taskTagLinksProvider = StreamProvider<List<TagLink>>((ref) {
  return ref.watch(repositoryProvider).watchTaskTagLinks();
});

final notesProvider = StreamProvider<List<Note>>((ref) {
  return ref.watch(repositoryProvider).watchNotes();
});

final focusSessionsProvider = StreamProvider<List<FocusSession>>((ref) {
  return ref.watch(repositoryProvider).watchFocusSessions();
});

final lifeEventsProvider = StreamProvider<List<LifeEvent>>((ref) {
  return ref.watch(repositoryProvider).watchLifeEvents();
});

final importBatchesProvider = StreamProvider<List<ImportBatche>>((ref) {
  return ref.watch(repositoryProvider).watchImportBatches();
});

final sleepRecordsProvider = Provider<List<SleepRecord>>((ref) {
  final events =
      ref.watch(lifeEventsProvider).valueOrNull ?? const <LifeEvent>[];
  return buildSleepRecords(events);
});

final todayTasksProvider = FutureProvider<List<Task>>((ref) {
  return ref.watch(repositoryProvider).tasksForDay(DateTime.now());
});

final focusMinutesProvider = FutureProvider<int>((ref) {
  return ref.watch(repositoryProvider).focusMinutes();
});

final todayFocusMinutesProvider = FutureProvider<int>((ref) {
  final now = DateTime.now();
  final start = DateTime(now.year, now.month, now.day);
  return ref
      .watch(repositoryProvider)
      .focusMinutes(start: start, end: start.add(const Duration(days: 1)));
});

final searchQueryProvider = StateProvider<String>((ref) => '');

final searchResultsProvider = FutureProvider<List<SearchHit>>((ref) {
  final query = ref.watch(searchQueryProvider);
  return ref.watch(repositoryProvider).search(query);
});

void refreshCore(WidgetRef ref) {
  ref.invalidate(todayTasksProvider);
  ref.invalidate(focusMinutesProvider);
  ref.invalidate(todayFocusMinutesProvider);
  ref.invalidate(tasksProvider);
  ref.invalidate(taskCategoriesProvider);
  ref.invalidate(tagsProvider);
  ref.invalidate(taskTagLinksProvider);
  ref.invalidate(notesProvider);
  ref.invalidate(focusSessionsProvider);
  ref.invalidate(lifeEventsProvider);
  ref.invalidate(importBatchesProvider);
  ref.invalidate(sleepRecordsProvider);
}
