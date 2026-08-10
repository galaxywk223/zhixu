# 知序 Zhixu

知序是本地优先的个人任务与记录工作台。仓库采用多端单仓结构，各客户端遵循平台规范独立实现，共享数据契约、业务验收夹具、Supabase 定义和番茄 TODO 解析核心。

## 仓库结构

```text
apps/windows/            Electron + React Windows 客户端
shared/contracts/        跨端 TypeScript 类型与 JSON Schema
shared/fixtures/         跨语言业务验收夹具
native/tomatodo_importer Rust 番茄 TODO 解析核心与 CLI
supabase/                数据库迁移与同步协议
```

Android 客户端将在 `apps/android` 中独立实现，当前版本不包含 Android 业务代码。

## Windows 开发

环境要求：Node.js 24、pnpm 10、Rust stable、Windows 10/11 x64。

```powershell
pnpm install
pnpm lint
pnpm typecheck
pnpm test
cargo test --manifest-path native/tomatodo_importer/Cargo.toml
pnpm build:windows
pnpm package:windows
pnpm self-test:windows
```

`pnpm dev:windows` 会启动图形界面，仅应在允许本机 GUI 检查时运行。

`pnpm package:windows` 生成 `Zhixu-Setup-<version>.exe`、`latest.yml` 和兼容旧 Flutter 更新器的 `update-manifest.json`。`pnpm self-test:windows` 使用隔离的临时数据目录运行解包版命令行自检，不创建应用窗口。

## 账户与同步

根目录 `.env` 提供 Windows 客户端构建所需的公开 Supabase 配置：

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
```

服务端迁移使用本地环境中的 `SUPABASE_PROJECT_REF`、`SUPABASE_ACCESS_TOKEN` 和 `SUPABASE_DB_PASSWORD`。部署凭据不得写入仓库或打包进客户端。Supabase Auth 需要启用邮箱确认，并将 `zhixu://auth/callback` 加入允许的重定向地址。

缺少客户端配置时，Windows 客户端保持本地模式并在“账户与同步”中显示未配置状态。同步会话由 Windows 安全存储加密保存，业务数据继续存储在本地 SQLite 中。

## 数据目录

- 旧 Flutter 数据库：`%APPDATA%\GalaxyWK\Zhixu\Zhixu\zhixu.sqlite`
- Electron 数据库：`%LOCALAPPDATA%\Zhixu\Data\zhixu.sqlite`
- 迁移备份：`%LOCALAPPDATA%\Zhixu\MigrationBackups`
- 首次同步备份：`%LOCALAPPDATA%\Zhixu\SyncBackups`

首次启动只读取旧数据库，并在独立副本上执行 schema 8 迁移。旧数据库和旧客户端不会自动删除。

## 发布边界

Windows 预览版使用独立 NSIS 安装目录和应用数据目录。正式版本接入代码签名前，构建产物仅作为未签名预览包使用。CI 只上传构建产物，不创建 GitHub Release。
