import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/repository.dart';

const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

enum SyncState { unavailable, signedOut, idle, syncing, error }

class SyncService extends ChangeNotifier {
  SyncService(this.repository);

  final ZhixuRepository repository;
  SupabaseClient? _client;
  SyncState state = SyncState.unavailable;
  String? errorMessage;

  bool get configured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
  User? get user => _client?.auth.currentUser;

  Future<void> initialize() async {
    if (!configured) {
      state = SyncState.unavailable;
      notifyListeners();
      return;
    }
    if (!Supabase.instance.isInitialized) {
      await Supabase.initialize(
        url: supabaseUrl,
        publishableKey: supabaseAnonKey,
      );
    }
    _client = Supabase.instance.client;
    state = user == null ? SyncState.signedOut : SyncState.idle;
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    await initialize();
    final client = _client;
    if (client == null) throw StateError('未配置同步服务');
    await client.auth.signInWithPassword(email: email, password: password);
    state = SyncState.idle;
    notifyListeners();
    await syncNow();
  }

  Future<void> signUp(String email, String password) async {
    await initialize();
    final client = _client;
    if (client == null) throw StateError('未配置同步服务');
    await client.auth.signUp(email: email, password: password);
    state = SyncState.signedOut;
    notifyListeners();
  }

  Future<void> signOut() async {
    if (_client != null) await _client!.auth.signOut();
    state = configured ? SyncState.signedOut : SyncState.unavailable;
    notifyListeners();
  }

  Future<void> syncNow() async {
    await initialize();
    final client = _client;
    final currentUser = user;
    if (client == null || currentUser == null) {
      state = configured ? SyncState.signedOut : SyncState.unavailable;
      notifyListeners();
      return;
    }
    state = SyncState.syncing;
    errorMessage = null;
    notifyListeners();
    try {
      for (final item in await repository.pendingOutbox()) {
        final payload = jsonDecode(item.payloadJson);
        if (payload is! Map) {
          await repository.removeOutbox(item.id);
          continue;
        }
        final body = Map<String, dynamic>.from(payload)
          ..['user_id'] = currentUser.id;
        final table = _tableName(item.entityType);
        await client.from(table).upsert(body, onConflict: 'id');
        await repository.removeOutbox(item.id);
      }
      for (final type in const [
        'task',
        'note',
        'schedule_block',
        'focus_session',
        'life_event',
      ]) {
        final cursor = await repository.syncCursor(type);
        final table = _tableName(type);
        var query = client.from(table).select().eq('user_id', currentUser.id);
        if (cursor != null) {
          query = query.gt('updated_at', cursor.toUtc().toIso8601String());
        }
        final rows = await query
            .order('updated_at', ascending: true)
            .limit(500);
        DateTime? latest;
        for (final raw in rows) {
          final payload = Map<String, dynamic>.from(raw);
          final updated = DateTime.tryParse(
            payload['updated_at'] as String? ?? '',
          );
          if (updated != null && (latest == null || updated.isAfter(latest))) {
            latest = updated;
          }
          payload.remove('user_id');
          await repository.applyRemoteEntity(type, payload);
        }
        if (latest != null) await repository.saveSyncCursor(type, latest);
      }
      state = SyncState.idle;
    } catch (error) {
      state = SyncState.error;
      errorMessage = error.toString();
    }
    notifyListeners();
  }

  String _tableName(String entityType) => switch (entityType) {
    'task' => 'tasks',
    'note' => 'notes',
    'schedule_block' => 'schedule_blocks',
    'focus_session' => 'focus_sessions',
    'life_event' => 'life_events',
    _ => throw StateError('不支持的同步实体: $entityType'),
  };
}
