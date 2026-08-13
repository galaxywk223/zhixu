# 贡献指南

## 开发环境

- Windows 10/11 x64
- Node.js 24
- pnpm 10
- Rust stable

## 本地开发

```powershell
pnpm install
pnpm dev:windows
```

根目录 `.env` 需提供构建使用的公开 Supabase URL 和 anon key，字段模板见 [.env.example](.env.example)。Supabase access token、数据库密码及第三方 AI 密钥不得写入仓库、日志、Issue 或 Pull Request。

## 质量检查

```powershell
pnpm lint
pnpm typecheck
pnpm test
cargo fmt --manifest-path native/tomatodo_importer/Cargo.toml -- --check
cargo test --manifest-path native/tomatodo_importer/Cargo.toml
pnpm build:windows
pnpm package:windows
pnpm self-test:windows
```

文档或模板变更至少运行相关 Prettier 检查和 `git diff --check`。运行 `pnpm dev:windows` 或其他图形界面验证前，应确认测试环境不会读取或改动真实个人数据。

## 变更要求

- 提交保持单一主题，并同步更新相关测试和文档。
- 数据库、同步实体、备份格式或 IPC 接口变更需保持现有迁移与恢复兼容性。
- 财务导入变更需覆盖重复导入、来源差异、人工调整和原始数据脱敏。
- 界面变更需保持 Windows 键盘操作、中文输入法、浅色/深色主题和受支持窗口尺寸可用。
- 第三方代码、字体、图标、语料或其他素材需记录来源、固定版本和许可证。
- 应用版本、安装包版本、更新清单和 Release 标签需保持一致。

## Issue

Bug 报告和功能建议使用仓库提供的 Issue 表单。公开 Issue 不得包含邮箱、密码、令牌、数据库、账单、未脱敏日志或其他个人数据。安全问题按 [SECURITY.md](SECURITY.md) 私密提交。

## Pull Request

Pull Request 应说明变更目的、用户影响、验证命令和兼容性影响。界面变更应提供必要的验证证据；涉及个人数据的截图和日志必须先完成脱敏。

分支应基于最新 `main`，提交历史保持聚焦。仓库采用 squash merge，合并后删除源分支。
