# AT Time

时间戳、时区、Cron 和 Duration 工具。项目同时发布独立桌面应用和可安装到 AT Tool 的插件包。

## 开发

```bash
corepack pnpm install
corepack pnpm dev
corepack pnpm test
corepack pnpm build
corepack pnpm build:plugin
corepack pnpm tauri:dev
```

插件身份为 `com.attson.time`，仅申请 `host.theme.read` 权限；复制使用浏览器 Clipboard API，并在 API 不可用或被权限策略拒绝时使用用户操作触发的 fallback。

## 发布

向 GitHub `prod` Environment 配置以下 Secrets：

- `ATTIME_PUBLISHER_KEY_ID`
- `ATTIME_PUBLISHER_PRIVATE_KEY`
- `ATTIME_PUBLISHER_PUBLIC_KEY`

推送 `v` 前缀的 SemVer tag 后，Release workflow 会构建五个平台安装包和五个签名 `.atpkg`。
