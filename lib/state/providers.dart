import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.dark);

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

final projectsProvider = StreamProvider<List<Project>>((ref) {
  return ref.watch(repositoryProvider).watchProjects();
});

final notesProvider = StreamProvider<List<Note>>((ref) {
  return ref.watch(repositoryProvider).watchNotes();
});

final todayTasksProvider = FutureProvider<List<Task>>((ref) {
  return ref.watch(repositoryProvider).tasksForDay(DateTime.now());
});

final focusMinutesProvider = FutureProvider<int>((ref) {
  return ref.watch(repositoryProvider).focusMinutes();
});

final searchQueryProvider = StateProvider<String>((ref) => '');

final searchResultsProvider = FutureProvider<List<SearchHit>>((ref) {
  final query = ref.watch(searchQueryProvider);
  return ref.watch(repositoryProvider).search(query);
});

void refreshCore(WidgetRef ref) {
  ref.invalidate(todayTasksProvider);
  ref.invalidate(focusMinutesProvider);
  ref.invalidate(tasksProvider);
  ref.invalidate(projectsProvider);
  ref.invalidate(notesProvider);
}
