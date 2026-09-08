# DeepSeek RSI

最新实现：`0.0.0-g2.3` 已接入偏好与预算合并确认、独立候选生成和检查、人工启用及页面衔接。新流程、版本 5 迁移、当前验证与限制统一见 [主流程报告](MAINFLOW-REPORT.md)。以下 g2.0–g2.2 的实现与安装记录保留为历史；本轮未升级正在使用的 Harness profile，未新增真实付费调用。

独立维护的 DeepSeek Harness Skill 优化插件工程。目标是观察任务信号，经用户授权优化 Skill 文本与 Python/Shell 脚本，以固定评测形成证据，再由用户决定是否启用。

首个完整场景已确定为前端页面设计与用户偏好适配，采用已确认的“轻量主动询问＋项目内记忆”，代码仓库分析等后续扩展。当前已实现初始设计 Skill、固定偏好问题与上下文准备；候选执行及效果比较继续按 Gate 实现。产品规则见 [前端场景与偏好边界](FRONTEND-SCENARIO.md)。

用户已进一步确认下一段主流程：同一张卡确认自然语言偏好、Skill 修改范围与预算，随后独立调用模型生成 Skill 候选；检查通过且用户确认启用后，再用新版开始本次页面任务。明确偏好可直接触发已授权修改，无须先命中本地观察规则或另做一次建议分析。旧会话已使用旧 Skill 时自动创建关联新会话并带入本次需求和确认偏好；候选未被采用则保留旧版，由用户选择继续或停止。此流程尚未实现，已确认决策和执行边界见 [G2 的偏好驱动修改契约](G2-CONTRACTS.md#偏好驱动的独立修改任务)。

## 文档导航

这里是项目资料的统一入口。按当前任务选择阅读路线：

| 要做什么 | 阅读路线 | 文档负责的内容 |
|---|---|---|
| 启动、安装或开发插件 | 本文「开发与验证」「本地安装包」「G1 的使用顺序」 | 当前入口、命令与使用限制 |
| 了解产品范围、架构与 Gate | [FRAMEWORK.md](FRAMEWORK.md) | 全局方案、阶段目标与职责边界 |
| 开发前端设计首场景 | [FRONTEND-SCENARIO.md](FRONTEND-SCENARIO.md) → [G2-CONTRACTS.md](G2-CONTRACTS.md) → [FRAMEWORK.md](FRAMEWORK.md) | 完整产品边界、当前准备字段与后续单候选要求 |
| 开发偏好驱动的 Skill 修改 | [G2 待实现契约](G2-CONTRACTS.md#偏好驱动的独立修改任务) → [核心版本绑定规则](CONTRACTS.md#32-会话绑定-sessionskillbinding) | 合并授权卡、模型候选、启用前等待与会话衔接；不等于 g2.2 已有能力 |
| 修改数据、权限或状态转换 | [CONTRACTS.md](CONTRACTS.md) → [G1-CONTRACTS.md](G1-CONTRACTS.md) → [G2-CONTRACTS.md](G2-CONTRACTS.md) | 核心不变量、字段语义、状态约束与版本 4 迁移 |
| 核对已经实现和验证的能力 | [G2-REPORT.md](G2-REPORT.md) → [G1-REPORT.md](G1-REPORT.md) → [G0-REPORT.md](G0-REPORT.md) | 验证结果、证据位置、失败与适用限制 |
| 查宿主安装和历史环境问题 | [HARNESS-LOCAL.md](HARNESS-LOCAL.md) → 本文当前启动说明 | 本机环境与历史运行记录 |
| 查外部方案和源码研究 | [SOURCE-REVIEW.md](SOURCE-REVIEW.md) | 研究时的固定提交、调用链和借鉴范围 |
| 开始代码修改或增加文档 | [../AGENTS.md](../AGENTS.md) → 本表对应资料 | 开发规范、阅读要求、验证与资源清理 |

文档分工：产品规则看框架及场景文档，跨边界语义看契约，历史验证看报告；当前实现仍需核对 [src/](../src/) 和 [tests/](../tests/)。可执行字段分别定义在 [核心 schema](../src/contracts.ts)、[G1 schema](../src/g1-contracts.ts) 和 [前端准备 schema](../src/frontend-contracts.ts)，变更时同步对应契约。历史研究或实验示例不自动变成当前实现或消费授权。

文档间链接相对 `docs/`；文中 `src/`、`scripts/`、`fixtures/`、`.cache/` 等代码或证据路径默认相对仓库根目录，命令按所在段落指定的仓库执行。项目文本资料统一在本目录，运行所需的 Skill 与参考文件仍在 [fixtures/](../fixtures/)。

## 新主流程

在聊天框提交前端页面需求，右侧确认卡会先暂停页面请求。填写自然语言偏好、补齐本次需求与必需项目约束，核对完整文件、修改范围与预算，提交后独立生成候选。审阅完整变更、固定检查与用量后，单独确认启用并开始页面；未采用候选时选择旧版继续或停止。

已有会话用过不同版本时自动建立关联新会话，仅带入本次确认需求和偏好，右侧可打开。原会话保留旧绑定。旧 Enrollment 不获得修改授权；结束原观察范围后提交新任务进入新主流程。当前项目范围保存偏好并在启用时更新项目版本，仅本次范围不改变项目默认。

完整权威字段为 `src/mainflow-contracts.ts`，实现和验收见 [MAINFLOW-REPORT.md](MAINFLOW-REPORT.md)。默认模型上限与检查边界必须在实际确认卡核对，默认值不代表消费授权。

## g2.2 历史状态

`0.0.0-g2.2` 将常用入口前移到任务开始：用户直接在聊天框提交前端编写需求，RSI 使用 Harness 原生提问卡询问是否纳入本次迭代。确认前不派发依赖它的模型请求；纳入后自动登记所选 Skill，记录本次线索。同会话连续修改沿用选择；新会话或点击「结束本次任务」后再次询问。拒绝时原任务继续，纳入不授权改写 Skill。手动登记与两批偏好准备收进右侧高级设置。该版本不代表 Docker 单候选 Gate 已完成，证据见 [G2 前置报告](G2-REPORT.md)。

G1 已实现主页面右侧 RSI 面板：逐个纳入目录型 Skill、按本地规则观察任务、预览并确认一次分析、选择方向和保存授权草稿。当前会话与选定 RSI 分析的 Token 分开显示；来源变化、过期命令及未知用量会阻止不适当的后续操作。

分析调用需要单独确认；保存草稿不授权修改。分析默认使用 DeepSeek-V4-Flash / Low，最多 1 次请求、4096 输出 Token（含推理）、32 KiB 输入、5 分钟，不重试。Low 真实分析已成功，确认 3987 Token；草稿步骤通过独立、无网络的响应回放验证，未把这两段写成完整在线验证。正式评测、候选迭代和启用流程属于后续 Gate，当前不会覆盖原 Skill。G0 诊断入口仍在「设置 → 插件 → DeepSeek RSI」。验收与限制见 [G1 报告](G1-REPORT.md)、[G1 契约](G1-CONTRACTS.md)和 [G0 报告](G0-REPORT.md)。

## 开发与验证

当前基于 Harness 提交 `d347e703908d0406b7a7ef80e3a0e594d86b2215` 加 [右侧面板补丁](../patches/harness-right-panel.patch)。本机测试使用 Node 25.8.1，以匹配现有 Harness 原生依赖；插件声明 Node >=24，其他组合仍需验证。代码使用 Tab，持续遵循 ponytail full。

先在 Harness 仓库应用补丁并构建（当前本机 checkout 已应用，不要重复应用）：

```sh
git apply --check /Users/black/Documents/ChatGPT/DeepSeek-RSI/patches/harness-right-panel.patch
git apply /Users/black/Documents/ChatGPT/DeepSeek-RSI/patches/harness-right-panel.patch
pnpm run build
```

补丁只扩展原生布局和对应检查，不修改 Agent Loop。将来切换底座提交时需要重新验证。随后在本仓库执行（使用上述 Node 版本的终端）：

```sh
npm ci --ignore-scripts
npm run link:harness -- /Users/black/Documents/VSCodeProject/deepseek-harness
npm run typecheck
npm test
npm run build
```

`link:harness` 只连接已构建的本地 Harness 包，并拒绝不匹配的提交。这样能使用固定源码的真实类型，避免混用滞后的 npm 包。需要先按 Harness 自身文档安装依赖并构建。Zod 复用宿主已有的校验方案，TypeScript、esbuild 和类型声明仅用于开发，没有复制整个宿主工具链。

开发覆盖层只用于尚未安装本插件的独立 profile。在 Harness 仓库启动：

```sh
env -u DEEPSEEK_API_KEY DSH_HOME=/Users/black/.dsh-rsi-source DSH_TELEMETRY_MODE=DISABLED /opt/homebrew/bin/node --import tsx/esm apps/cli/src/bin.ts web --patch /Users/black/Documents/ChatGPT/DeepSeek-RSI/cordis.patch.yml --no-open
```

使用启动时显示的认证入口，主页面右侧默认显示 RSI。桌面收起后可用右上角 RSI 按钮重新打开；开关偏好在同一浏览器地址下恢复。按 Ctrl+C 停止。不同时使用开发覆盖层和同一插件的已安装版本。

## 本地安装包

在插件仓库构建并打包：

```sh
mkdir -p .cache
npm run build
npm pack --ignore-scripts --pack-destination .cache
```

在应用补丁后的 Harness 仓库中安装或升级现有 Web profile。先停止使用该 profile 的宿主，并备份 `DSH_HOME/rsi/g0.sqlite`（若存在）；首次启动会将 SQLite 升级到版本 5，保留旧账本、回执与前端快照，补入空主流程记录。旧包不能直接读取新格式，回退使用停机备份或独立目录。此处沿用已有凭据配置：

```sh
env DSH_HOME=/Users/black/.dsh-rsi-dev /opt/homebrew/bin/node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add /Users/black/Documents/ChatGPT/DeepSeek-RSI/.cache/b1ackb-deepseek-rsi-0.0.0-g2.3.tgz --ignore-scripts
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

## G1 的使用顺序

这段保留手动管理与分析路径。前端编写通常从下面的主动流程开始，无须先打开高级设置。

1. 在 Harness 添加工作区，使现有目录型 Skill 能被宿主枚举。在右侧「高级设置 → 纳入已有 Skill」逐个纳入，核对来源后开始观察后续任务。
2. 日常任务需实际加载该 Skill，插件才会记录可归属的失败、重复读取、长输出、重试或简洁表达偏好。没有足够线索时不会编造机会。
3. 点击「分析优化机会」先生成发送预览；检查上下文、模型和预算后，点击「确认范围与预算，开始分析」才会调用一次模型。不会自动重试或执行工具。
4. 核对模型给出的方向、拟修改文件和必需保留信息，可保存授权草稿。正式评测契约尚未配置时正式授权被禁用；后续 Gate 补齐后仍需重新确认。

用量随供应商 usage 到达更新；未返回的 Token 显示待结算，不通过字符数伪造实时数值。断线保留最后快照并禁用写操作，重连使用宿主持久记录。关闭页面不会取消已确认的分析，可以在面板主动取消；宿主重启保留中断状态，不自动重放。

## 前端设计准备的使用顺序

常用流程：在聊天框提交“请设计一个前端落地页”等明确编写需求，或 `/rsi-frontend-design 页面需求`。RSI 先询问是否纳入本次；确认后自动登记并继续编写，右侧显示本次范围。未指定 Skill 时，提问会明确给出可选 Skill，不把建议写成已经采用。选择暂不纳入时不追加建议 Skill，也不记录本次优化线索。

同一会话的连续修改只询问一次。要在同一会话开始另一项前端任务，先在右侧点击「结束本次任务」；新会话会再次询问。这个按钮不取消正在编写的 Agent。纳入确认使用原生问答，不消耗额外模型 Token；正常编写仍按会话路线计量。

本地规则不能理解所有表达。使用明确的 `/Skill名称` 可让已识别的前端 Skill 在首个请求前确认；模型中途才选定前端 Skill 时，在加载前补问，之前的日常调用仍计费。支持当前可枚举的目录型 Skill，首次最多展示六个候选，单任务选择一个迭代目标。

需要预先管理偏好或单独准备一次分析时，展开右侧「高级设置：Skill 与设计偏好」：

1. 选择工作区，按需通过「纳入已有 Skill」手动纳入随插件提供的 `rsi-frontend-design`；已通过任务询问纳入的 Skill 无须重复登记。
2. 在「前端设计准备」填写页面用途、必需内容与交互、技术栈和产物位置，点击「开始设计准备」。缺失维度会出现固定问题卡，不消耗 Token。
3. 回答时核对保存范围：默认当前项目，也可仅本次或明确保存为个人通用；支持无偏好、跳过与停止本次提问。已有偏好可在管理区查看，本次要求可单独覆盖。
4. 确认上下文后可展开「复制已确认上下文」，全选复制到普通 Harness 任务；当前没有自动注入会话。改变持久偏好不会改写这份快照，改变本次条件需结束准备并重新确认。
5. 「预览设计优化分析」将 Skill 片段与冻结上下文放入发送预览，仍需确认范围和一次调用预算后才调用模型。方向可保存为授权草稿；当前没有候选写入、页面生成、自动评测或启用权限。

固定问题验收脚本为 `scripts/browser-frontend.mjs`，它只应连接 `scripts/g1-browser-fixture.ts` 注册的隔离 profile。测试响应中的 130 Token 是账本展示样例，不是实际模型调用费用。
