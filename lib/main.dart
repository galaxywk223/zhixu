import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:window_manager/window_manager.dart';

import 'app.dart';
import 'data/database.dart';
import 'data/repository.dart';
import 'services/desktop_lifecycle_service.dart';
import 'state/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('zh_CN');
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    await windowManager.ensureInitialized();
    await DesktopLifecycleController.instance.initialize();
    const options = WindowOptions(
      size: Size(1440, 920),
      minimumSize: Size(1080, 680),
      center: true,
      title: '知序',
      backgroundColor: Colors.transparent,
      skipTaskbar: false,
    );
    await windowManager.waitUntilReadyToShow(options, () async {
      await windowManager.show();
      await windowManager.focus();
    });
  }
  final database = await ZhixuDatabase.open();
  await ZhixuRepository(database).reconcileLegacyTomatoData();
  runApp(
    ProviderScope(
      overrides: [databaseProvider.overrideWithValue(database)],
      child: const ZhixuApp(),
    ),
  );
}
