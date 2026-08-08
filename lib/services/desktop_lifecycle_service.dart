import 'dart:io';

import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

class DesktopLifecycleController with WindowListener, TrayListener {
  DesktopLifecycleController._();

  static final instance = DesktopLifecycleController._();

  bool _initialized = false;
  bool _isExiting = false;

  bool get supported =>
      Platform.isWindows || Platform.isLinux || Platform.isMacOS;

  Future<void> initialize() async {
    if (!supported || _initialized) return;
    _initialized = true;
    windowManager.addListener(this);
    trayManager.addListener(this);
    await windowManager.setPreventClose(true);
    await trayManager.setIcon('assets/tray/zhixu.ico');
    await trayManager.setToolTip('知序');
    await trayManager.setContextMenu(
      Menu(
        items: [
          MenuItem(key: 'show_window', label: '显示知序'),
          MenuItem.separator(),
          MenuItem(key: 'exit_app', label: '退出知序'),
        ],
      ),
    );
  }

  Future<void> showWindow() async {
    if (!supported) return;
    if (await windowManager.isMinimized()) await windowManager.restore();
    await windowManager.show();
    await windowManager.focus();
  }

  Future<void> hideWindow() async {
    if (!supported || _isExiting) return;
    await windowManager.hide();
  }

  Future<void> exitApplication() async {
    if (!supported || _isExiting) return;
    _isExiting = true;
    trayManager.removeListener(this);
    windowManager.removeListener(this);
    await trayManager.destroy();
    await windowManager.setPreventClose(false);
    await windowManager.destroy();
  }

  @override
  void onWindowClose() {
    if (_isExiting) return;
    hideWindow();
  }

  @override
  void onTrayIconMouseDown() {
    showWindow();
  }

  @override
  void onTrayIconRightMouseDown() {
    trayManager.popUpContextMenu();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    switch (menuItem.key) {
      case 'show_window':
        showWindow();
      case 'exit_app':
        exitApplication();
    }
  }
}
