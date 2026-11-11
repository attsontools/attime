# AT Time Review Profile

## 项目边界

- 项目名称：`attime`，对外名称固定为“时间工具”。
- 同一套 Vue UI 同时构建独立 Tauri 应用和 AT Tool 插件，不维护两套业务实现。
- `src/time.ts` 保持纯逻辑、宿主无关；平台与浏览器能力只通过 `src/host/` 适配。
- 本仓库只持有 Time Publisher 发布职责。Root、Catalog 的生成和签名属于 `attsontools/attool`。

## 固定身份与权限

- 插件身份固定为 `appId=com.attson.time`、`publisher.id=com.attson`、名称“时间工具”。
- Tauri identifier 固定为 `com.attson.time`。
- 插件只声明 `host.theme.read`。剪贴板复制使用浏览器 Clipboard API，不增加 Host 文件或通知权限。
- 身份、Publisher key ID、Host API 范围或权限变化属于信任边界变更，必须同时检查 Catalog 兼容性。

## 架构规则

- `src/App.vue` 不直接导入 Tauri API 或 Plugin SDK；宿主调用通过 `TimeHost`。
- plugin 模式连接失败必须显示阻塞错误，不得静默退化为 standalone。
- standalone 模式可以自行维护主题；plugin 模式主题由宿主握手和事件驱动。
- Unix、时区、Cron 和 Duration 逻辑必须位于可独立测试的纯函数模块。
- 不为纯前端能力新增 Rust command 或 Tauri plugin。

## 打包与签名

- 插件资产名固定为 `AT.Time_<version>_<os>_<arch>.atpkg`。
- Release 必须精确包含五个平台安装包和五个相应 `.atpkg`，不得缺少、重复或夹带其他资产。
- GitHub Actions `prod` Environment 提供 `ATTIME_PUBLISHER_KEY_ID`、`ATTIME_PUBLISHER_PRIVATE_KEY`、`ATTIME_PUBLISHER_PUBLIC_KEY`。
- Publisher 私钥必须为 Ed25519 且与配置的原始公钥匹配；任何缺失、格式错误或不匹配都必须 fail closed。
- manifest 签名前必须列出包内全部业务文件及 SHA-256；发布前必须重新解包验证签名、身份、目标、文件集合和哈希。
- Publisher 私钥不得进入源码、日志、构建产物、测试夹具或 Catalog 仓库。

## 测试与审查

- `src/time.ts`、宿主适配和打包脚本变更先写或更新测试，再实现。
- 运行 `pnpm test`、`pnpm build`、`pnpm build:plugin`；Tauri 或依赖变化再运行 `cargo check --manifest-path src-tauri/Cargo.toml`。
- UI 变更至少检查桌面与窄屏，确认四个工具页签、滚动、主题和复制反馈正常。
- 重点搜索遗留的 `text`、`AT.Text`、`com.attson.text`、`ATTEXT_`，这些通常表示复制模板未完成。
- 不引入新依赖，除非现有平台能力确实无法满足需求。

## 关键文件

- `src/time.ts`：宿主无关的时间处理核心。
- `src/App.vue`：四类时间工具交互。
- `src/host/standalone.ts`：独立应用适配。
- `src/host/plugin.ts`：AT Tool 插件适配。
- `scripts/package-plugin.mjs`：插件清单、签名、归档和回读验证。
- `scripts/verify-release.mjs`：版本一致性与 Release 资产集合验证。
- `.github/workflows/release.yml`：五平台独立应用和插件发布。
