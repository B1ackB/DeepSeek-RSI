# DeepSeek Harness 本地运行

安装日期：2026-09-07。

2026-09-08 更新：G0 插件已作为本地包安装到隔离的 Web profile，OrbStack 2.2.3 初始化完成。实际探针与清理结果见 [G0-REPORT.md](G0-REPORT.md)。本轮仍使用 Node 25.8.1；原生插件管理调用到的 pnpm 为 11.19.0。开发覆盖层与安装包不要同时加载。

- 源码目录：`/Users/black/Documents/VSCodeProject/deepseek-harness`
- 仓库：`https://github.com/B1ackB/deepseek-harness`
- 已验证版本：`0.1.3-alpha.1`，提交 `d347e70390`
- 本次安装和运行环境：Node.js `25.8.1`、pnpm `11.7.0`
- 本地地址：`http://127.0.0.1:3080/`
- 独立配置与会话目录：`/Users/black/.dsh-rsi-dev`

## 启动与停止

在终端执行：

```sh
cd /Users/black/Documents/VSCodeProject/deepseek-harness
env -u DEEPSEEK_API_KEY DSH_HOME=/Users/black/.dsh-rsi-dev DSH_TELEMETRY_MODE=DISABLED corepack pnpm dsh web
```

保持该终端运行；按 `Ctrl+C` 停止。已有服务运行时不必重复启动。默认命令会打开带本地认证入口的浏览器页面；如果新浏览器直接访问地址要求认证，使用启动时终端显示的本地链接，不要把其中的令牌分享出去。

`env -u DEEPSEEK_API_KEY` 只让本次进程不继承该环境变量，使 Web 界面保存的密钥能够生效，不会删除系统环境变量。遥测在这条命令中关闭。

## 模型配置

在 Web 界面打开「设置 → 模型 → DeepSeek」，填写有效 API 密钥并保存。凭证由 Harness 管理，保存在独立配置目录下；不要提交到 Git 或粘贴到聊天中。

## 已完成验证

- `corepack pnpm install --frozen-lockfile` 成功。
- `corepack pnpm run build` 成功，宿主和 Web 产物已生成。
- Web 服务启动成功，浏览器可打开设置和会话。
- 原继承环境密钥返回 `AUTH / API 密钥无效`；已改为通过本地界面配置。
- 用户保存有效密钥后，`DeepSeek-V4-Flash / High` 真实调用成功。
- 模型调用 Bash 工具执行 `pwd`，工具显示「已完成」，输出 `/Users/black/Documents/DeepseekWorkZone`，最终回答 `HARNESS_OK /Users/black/Documents/DeepseekWorkZone`。
- 页面显示本轮用量约 `16.6K tok`（输入约 `16.4K tok`、输出 `116 tok`）；这包括标准模式上下文与工具调用往返，并非仅计算简短回复。

当前验证会话的工作区为 `/Users/black/Documents/DeepseekWorkZone`。如需处理 RSI 项目，在 Web 中「添加工作区」并选择 `/Users/black/Documents/ChatGPT/DeepSeek-RSI`。

本次未修改 Harness 源码。无需为日常启动重复安装和构建；升级源码或切换 Node.js 主版本后，应重新检查依赖与构建，尤其是原生模块。

RSI 插件目前仍处于框架规划阶段；本说明仅覆盖宿主运行。

## 2026-09-08 环境复核

当前终端默认 Node 已变为 `24.14.0`；上次安装所用的 `/opt/homebrew/bin/node` 仍为 `25.8.1`。源码提交未改变，工作区无修改，3080 检查时无监听。本次未重新启动服务或验证 API 凭据。

上面的 `corepack pnpm dsh web` 会使用执行环境中的 Node。为继续使用上次安装版本，后续 G0 可显式执行其等价入口：

```sh
cd /Users/black/Documents/VSCodeProject/deepseek-harness
env -u DEEPSEEK_API_KEY DSH_HOME=/Users/black/.dsh-rsi-dev DSH_TELEMETRY_MODE=DISABLED /opt/homebrew/bin/node --import tsx/esm apps/cli/src/bin.ts web
```

该入口根据当前 `package.json` 的 `dsh` 脚本展开，本次没有运行。它不修改用户全局 Node 配置；不能因为宿主声明支持 Node 24，就默认在 Node 25 下安装的原生依赖可直接混用。测试完成后关闭本次启动的进程，除非用户要求保留。
