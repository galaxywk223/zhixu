# 知序 Zhixu

知序是本地优先的个人任务与记录工作台，首发 Windows，支持手动任务、日历、Markdown 笔记、专注、睡眠统计和番茄 TODO 历史导入。专注记录用于独立统计，不会自动创建或修改任务。

项目仓库：<https://github.com/galaxywk223/zhixu>

许可证：MIT，详见 [LICENSE](LICENSE)。

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

## Windows 预览版发布

发布流程由 GitHub Actions 的 `v*.*.*` 标签工作流执行。版本号必须与
`pubspec.yaml` 的 `version` 字段一致，当前预览版本为 `0.1.6+7`。

```powershell
git tag v0.1.6
git push origin v0.1.6
```

工作流生成当前用户安装器 `Zhixu-Setup-<version>.exe`、对应的
`.sha256` 摘要文件和 `update-manifest.json`。应用通过 GitHub Releases API
读取包含预发布版本的清单，严格校验仓库、HTTPS 地址、文件名、大小和
SHA-256 后才启动安装器。SQLite 数据位于安装目录外，升级只覆盖
`%LOCALAPPDATA%\Programs\Zhixu`，不会删除业务数据。

## 预览版限制

- 番茄 TODO 导入支持旧版 `.xls` 中文恢复、时间区间去重、专注明细和睡眠事件分类。
- Windows 关闭按钮会隐藏到系统托盘；托盘菜单可恢复窗口或明确退出应用。
- Noto Sans SC 字体按照 SIL Open Font License 1.1 随应用分发，许可证位于 `assets/fonts/OFL.txt`。
- 应用图标复用 Microsoft Fluent System Icons 的 `Flow 24 Filled`，按照 MIT License 分发，来源和许可证见 `THIRD_PARTY_NOTICES.md`。
- 云同步及系统安全凭据存储尚未完成正式验收，首版默认本地模式。
- Windows 安装包暂未代码签名，首次运行可能显示 SmartScreen 未知发布者提示。
