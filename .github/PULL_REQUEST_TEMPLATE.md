## 变更摘要

说明变更目的及解决的问题。

## 用户影响

说明用户可见行为、数据兼容性、同步或发布影响。无用户影响时填写“无”。

## 验证

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `cargo fmt --manifest-path native/tomatodo_importer/Cargo.toml -- --check`
- [ ] `cargo test --manifest-path native/tomatodo_importer/Cargo.toml`
- [ ] `pnpm build:windows`
- [ ] 已完成与变更范围相符的额外验证，或已说明不适用项。

## 提交确认

- [ ] 变更保持单一主题，相关测试和文档已同步更新。
- [ ] 提交内容不包含凭据、个人数据、账单、数据库或未脱敏日志。
- [ ] 第三方代码或素材已记录来源、固定版本和许可证。
- [ ] 数据库、同步、备份或 IPC 变更已说明兼容性与迁移策略，或该项不适用。
