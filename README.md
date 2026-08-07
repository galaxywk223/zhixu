# 知序 Zhixu

知序是本地优先的个人任务与学习规划工作台，首发 Windows，支持任务、项目、日历、Markdown 笔记、统计和番茄 TODO 专注历史导入。

## 开发环境

- Flutter 3.41 / Dart 3.11
- Rust stable（用于旧版 `.xls` 解析器）
- Windows 10/11、Visual Studio C++ 桌面工具链

## 本地运行

```powershell
flutter pub get
powershell -File tool/build_native.ps1 -Release
flutter run -d windows
```

`build_native.ps1` 会将 `calamine` 解析器复制到 `assets/native/`，桌面端无需安装 Excel 即可导入番茄 TODO 导出的 `.xls`。

## 验证

```powershell
flutter analyze --no-pub
flutter test --no-pub
cargo test --manifest-path native/tomatodo_importer/Cargo.toml
flutter build windows --release
```

Supabase 未配置时，应用保持本地模式；登录和同步服务在设置页中按需启用。
