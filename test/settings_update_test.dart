import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zhixu/data/database.dart';
import 'package:zhixu/services/update_service.dart';
import 'package:zhixu/state/providers.dart';
import 'package:zhixu/ui/pages/settings_page.dart';

void main() {
  testWidgets('设置页展示完整的更新状态和动态版本', (tester) async {
    final service = _TestUpdateService();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          databaseProvider.overrideWithValue(ZhixuDatabase.memory()),
          updateServiceProvider.overrideWith((ref) => service),
        ],
        child: const MaterialApp(home: Scaffold(body: SettingsPage())),
      ),
    );
    service.setState(UpdateStatus.checking);
    await tester.pump();
    expect(find.text('知序 0.1.0'), findsOneWidget);
    expect(find.text('正在检查更新...'), findsOneWidget);

    service.setState(UpdateStatus.upToDate);
    await tester.pump();
    expect(find.text('当前已是最新版本'), findsOneWidget);

    service.setState(UpdateStatus.available, withRelease: true);
    await tester.pump();
    expect(find.text('发现 0.2.0'), findsOneWidget);
    expect(find.text('预览版更新说明'), findsOneWidget);
    expect(find.text('下载并安装'), findsOneWidget);

    service.setState(
      UpdateStatus.downloading,
      withRelease: true,
      progress: 0.42,
    );
    await tester.pump();
    expect(find.text('正在下载安装包'), findsOneWidget);
    expect(find.text('已下载 42%'), findsOneWidget);
    expect(find.text('下载中'), findsOneWidget);

    service.setState(UpdateStatus.error, message: '无法连接更新服务，请检查网络后重试。');
    await tester.pump();
    expect(find.text('更新检查失败'), findsOneWidget);
    expect(find.text('无法连接更新服务，请检查网络后重试。'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });
}

class _TestUpdateService extends UpdateService {
  _TestUpdateService() {
    currentVersion = '0.1.0';
  }

  void setState(
    UpdateStatus next, {
    bool withRelease = false,
    double progress = 0,
    String? message,
  }) {
    status = next;
    downloadProgress = progress;
    errorMessage = message;
    availableRelease = withRelease
        ? UpdateRelease(
            version: '0.2.0',
            notes: '预览版更新说明',
            releaseUrl: Uri.parse(
              'https://github.com/galaxywk223/zhixu/releases/tag/v0.2.0',
            ),
            downloadUrl: Uri.parse(
              'https://github.com/galaxywk223/zhixu/releases/download/v0.2.0/Zhixu-Setup-0.2.0.exe',
            ),
            fileName: 'Zhixu-Setup-0.2.0.exe',
            sha256Digest: List.filled(64, 'a').join(),
            size: 123,
          )
        : null;
    notifyListeners();
  }
}
