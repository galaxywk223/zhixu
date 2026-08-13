# 安全策略

## 支持范围

最新 [GitHub Release](https://github.com/galaxywk223/zhixu/releases/latest) 为当前支持版本。旧版本仅接受可复现性评估，不保证补丁回移。Android、macOS 和 Linux 不在当前支持范围内。

## 漏洞报告

安全问题应通过 GitHub 仓库的 **Private vulnerability reporting** 提交。未修复漏洞不应发布到公开 Issue、Discussion 或 Pull Request。

报告应包含：

- 受影响版本和 Windows 版本；
- 复现步骤、预期行为和实际行为；
- 影响范围及可利用条件；
- 已完成的数据脱敏说明；
- 可行的缓解或修复建议。

## 敏感信息

报告不得包含真实密码、访问令牌、Supabase 服务端凭据、完整认证会话、个人账单、未脱敏数据库或其他用户的个人数据。必要的日志和样本应裁剪到最小范围，并使用虚构值替换邮箱、路径、设备标识、交易信息和业务正文。

## 当前安全边界

- 业务数据默认存储在当前用户的本地 SQLite 数据库中。
- 登录会话使用 Electron `safeStorage` 加密保存。
- 同步服务使用 Supabase Auth 和行级安全策略隔离账户数据。
- 原始支付宝和微信账单文件只在本地解析；结构化财务记录可参与账户同步。
- 渲染进程通过 Context Bridge 和限定的 IPC 接口访问本机能力。
- 更新来源为本仓库的 GitHub Releases，安装包暂未接入商业代码签名。

数据处理细节见 [PRIVACY.md](PRIVACY.md)。
