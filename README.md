# DeepSeek RSI

独立维护的 DeepSeek Harness Skill 优化插件工程。目标是观察任务信号，经用户授权优化 Skill 文本与 Python/Shell 脚本，以固定评测形成证据，再由用户决定是否启用。

## 当前状态

G0 接入原型已实现：外部宿主/Web 包、Zod 契约、SQLite 事务账本、会话固定 Skill 版本、受限工具、Docker 生命周期探针，以及当前 Harness 会话与 RSI 分账的用量面板。打开面板不会发起模型请求。

2026-09-08 首批真实模型验证完成 4 次请求，共确认 5,026 Token。完整证据、适用范围及未验证部分见 [G0-REPORT.md](G0-REPORT.md)。此阶段没有优化器、正式题集、候选启用或源目录覆盖功能。

## 开发与验证

当前只验证过 Harness 提交 `d347e703908d0406b7a7ef80e3a0e594d86b2215`。本机测试使用 Node 25.8.1，以匹配现有 Harness 原生依赖；插件声明 Node >=24，其他组合仍需验证。代码使用 Tab，持续遵循 ponytail full。

在本仓库执行（使用上述 Node 版本的终端）：

```sh
npm ci --ignore-scripts
npm run link:harness -- /Users/black/Documents/VSCodeProject/deepseek-harness
npm run typecheck
npm test
npm run build
```

`link:harness` 只连接已构建的本地 Harness 包，并拒绝不匹配的提交。这样能使用固定源码的真实类型，避免混用滞后的 npm 包。需要先按 Harness 自身文档安装依赖并构建。Zod 复用宿主已有的校验方案，TypeScript、esbuild 和类型声明仅用于开发，没有复制整个宿主工具链。

开发时在 Harness 仓库启动：

```sh
env -u DEEPSEEK_API_KEY DSH_HOME=/Users/black/.dsh-rsi-dev DSH_TELEMETRY_MODE=DISABLED /opt/homebrew/bin/node --import tsx/esm apps/cli/src/bin.ts web --patch /Users/black/Documents/ChatGPT/DeepSeek-RSI/cordis.patch.yml --no-open
```

使用启动时显示的认证入口，进入「设置 → 插件 → DeepSeek RSI」。按 Ctrl+C 停止。不同时使用开发覆盖层和同一插件的已安装版本。

## 本地安装包

在插件仓库构建并打包：

```sh
mkdir -p .cache
npm run build
npm pack --ignore-scripts --pack-destination .cache
```

在固定版本的 Harness 仓库中安装到隔离的 Web profile：

```sh
env DSH_HOME=/Users/black/.dsh-rsi-dev /opt/homebrew/bin/node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add /Users/black/Documents/ChatGPT/DeepSeek-RSI/.cache/b1ackb-deepseek-rsi-0.0.0-g0.tgz --ignore-scripts
env -u DEEPSEEK_API_KEY DSH_HOME=/Users/black/.dsh-rsi-dev DSH_TELEMETRY_MODE=DISABLED /opt/homebrew/bin/node --import tsx/esm apps/cli/src/bin.ts web --no-open
```

卸载命令为同一 `DSH_HOME` 下的 `plugin --profile web remove @b1ackb/deepseek-rsi`。卸载保留 `DSH_HOME/rsi` 的状态与证据，不清空预算。模型凭据继续由 Harness 管理。

## 探针边界

`npm test` 不访问模型或 Docker。容器检查需先启动 OrbStack，然后执行：

```sh
RSI_DOCKER_BIN=/Users/black/.orbstack/bin/docker node scripts/docker-probe.ts
```

镜像摘要固定在 `src/docker.ts`；首次使用须先拉取该摘要。每个测试容器会在 finally 中清理并核对消失。若清理报错，停止追加工作，按错误中的唯一容器标识处理，不能假定已清理。

`node scripts/build.mjs --probe` 生成独立测试辅助模块，**不进入安装包**。它需要额外的本地测试覆盖层和 `RSI_G0_REPO`；`run-host-probe.mjs live` / `compression` 会消耗模型额度，必须先按 CONTRACTS.md §8 审阅本批预算。已有窗口到期或用户取消后不提供重置按钮；新批次另行确认，不能删除数据库续额度。

## 文档

- [G0-REPORT.md](G0-REPORT.md)：当前实现与验证结果。
- [FRAMEWORK.md](FRAMEWORK.md)：产品范围、架构和 G0–G5 验收。
- [CONTRACTS.md](CONTRACTS.md)：核心规则和 G0 字段、状态、预算契约。
- [AGENTS.md](AGENTS.md)：开发规范与清理要求。
- [SOURCE-REVIEW.md](SOURCE-REVIEW.md)：相关项目源码研究。
- [HARNESS-LOCAL.md](HARNESS-LOCAL.md)：本机环境与启动说明。
