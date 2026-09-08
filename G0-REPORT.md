# G0 接入实现与首批验证

日期：2026-09-08。范围：接入原型与受控探针，不包含 G1–G5 的优化闭环。开发持续使用 ponytail full、Tab 缩进。

## 当前结论

已证明无需修改固定版本 Harness 的 Agent Loop，就能挂载独立宿主/Web 插件，持久化受控状态，为工作 Agent 固定 Skill 版本、拒绝宿主工具，并登记正常请求、工具往返和原生摘要器的用量。原生重试链通过本地固定供应商响应验证。

G0 的主要接口可行性已获得证据；**完整 G0 验收仍保留“权威 usage 到浏览器实际绘制在 1 秒内”的端到端计时缺项**。目前测量的是同一推送通道的标记更新延迟；浏览器用量显示已实际检查，不能把这两项拼成已测量的端到端时延。不要将本报告标为全部验收通过。

## 环境与交付

- Harness：`d347e703908d0406b7a7ef80e3a0e594d86b2215`，0.1.3-alpha.1；未改动其源码。
- 插件：`@b1ackb/deepseek-rsi@0.0.0-g0`，单一 TypeScript 包，宿主 ESM 和 Harness 客户端工厂格式。
- Node：本机使用 `/opt/homebrew/bin/node` 25.8.1。TypeScript 6.0.3、esbuild 0.28.2、Zod 4.4.3；精确依赖见 package-lock.json。
- Harness 声明 pnpm 11.7.0；本次原生插件管理实际从 PATH 调用 pnpm 11.19.0。未全局切换用户 Node。
- OrbStack：2.2.3（20963），已完成用户同意的软件条款与首次初始化；Docker Server 29.4.0、arm64。没有启用开机自启、Kubernetes 或另建 Linux 机器。
- 模型凭据复用 `DSH_HOME=/Users/black/.dsh-rsi-dev`；报告、代码与安装包不含密钥或浏览器认证令牌。

## 证据矩阵

| 项目 | 实际证据 | 边界 |
|---|---|---|
| Web 状态 | 浏览器保存测试标记，刷新与多次重启后仍显示；认证 HTTP 检查通过 | 使用 Harness 原有认证和 RPC，无独立服务 |
| 安全输入 | 无 Cookie 返回 401，外部 Origin 返回 403，未定义字段拒绝；旧修订与冲突操作 ID 拒绝 | 不代表完整产品授权已实现 |
| 快照通知 | 真实 HTTP 长轮询的标记更新为 4–5 ms；UI 更新读取完整快照 | 尚缺 provider usage 到实际绘制的端到端计时 |
| 事务与恢复 | 注入 SQLite 操作回执写入失败后完整回滚；重启读取一致；第二写入进程拒绝 | 单机、单宿主 SQLite，不含分布式写入 |
| Skill 身份 | 同名全局干扰版本不胜过会话 provider；破坏指定封存版本后不会回退 | 仅使用人工准备的 g0-probe |
| 会话绑定 | 真实 ctx.agents.create/setup：A=v1、B=v2，dispose 后 resume A 仍=v1；资源路径一致 | 无生产有效版本切换接口 |
| 工具边界 | 实际工作 Agent 与后注册的禁止工具执行被 guard 拒绝，禁止执行计数为 0 | restrict 只限制继承可见性，guard 才负责派发拒绝 |
| Docker | Python、Shell、非 root、只读根与 Skill、无 Docker socket、仅 loopback、超时与取消均通过 | 是固定命令探针，不是 G2 完整 FS/Subprocess 执行世界 |
| 正常调用 | DeepSeek 日常探针 1 次、RSI 工具往返 2 次，均返回 usage | 仅当前已注册的 G0 文本请求，不回补历史会话 |
| 摘要调用 | 原生 summarizeWithLlm 真实调用 1 次，RSI/compression 归属正确 | 验证摘要请求与计量，不等于整段会话压缩提交/恢复已通过 |
| 受控重试 | 真实 Agent Loop + llm-retry + 固定本地 Adapter：第一次失败、第二次成功，派发前各有一条记录，关联实际 retry-started 事件 | 没有故意制造线上供应商故障或额外付费重试 |
| 重复与未知 | 重复 usage/finish 不重复累计；矛盾 usage 保留诊断；无 usage 的中断保留未知；未知阻止 RSI 追加但不阻断无关日常会话 | 未对供应商所有非标准输出形式作兼容 |
| 安装与卸载 | 本地 tarball 经 dsh plugin 安装、卸载；卸载后浏览器无 RSI 页签，原 POST 路径由宿主返回 405；最终包重新安装后独立启动通过 | 不依赖开发覆盖层，未验证其他 Harness 版本 |

## 首批付费预算与实际消费

批准上限：最多 8 次实际请求（包含往返、重试、压缩），V4-Flash / High，每次最多 4096 输出 Token；确认累计达 100000 时停止，20 分钟窗口包含清理。

| 归属 | 实际请求数 | 已确认 Token |
|---|---:|---:|
| 日常会话探针 | 1 | 1,432 |
| RSI 工具往返 | 2 | 2,414 |
| RSI 原生摘要 | 1 | 1,180 |
| 合计 | 4 | 5,026 |

另有 1 条未发送记录：测试辅助包初始缺失版本号，触发 `REQUEST_EXTENSION / DeepSeek request extension preparation failed`。根据持久会话事件及固定适配器源码，其失败发生在 HTTP 之前；探针没有图片，不涉及 Files API。核对后仅将该记录修订为 `not_sent` 并写入原因，未删除记录、未重置预算时间、未伪造供应商 usage。账本仍保守保留该次额度占位，共 5 条记录。

日常探针返回了正常协议响应与完整 usage，但模型拒绝输出要求的 `G0_DAILY_OK` 固定标记。因此该次只证明通信、用量和分账，不能声称模型指令遵循测试通过。RSI 探针实际执行了固定 Docker 工具；这里也没有将其扩展为 Skill 能力评测。

账本第一次占位到最后一次 usage 的时间为 519,078 ms（约 8 分 39 秒）。在线阶段结束后检查容器列表为空，停止 Harness 和 OrbStack VM，再通过 UI 退出 OrbStack；随后端口和进程检查均无残留。之后安装包验证仅启动不调用模型的 Harness。

供应商的 reasoning 可能已包含在 output 内，未重复相加。缓存字段缺失保留 null；总量使用供应商报告的 totalTokens，不从最终文字长度推断节省。

## 实现取舍及适用上限

1. `src/contracts.ts` 的 Zod 定义推导类型；SQLite JSON 记录在读写边界验证。数据库版本不识别时拒绝启动，不清空旧数据。
2. `src/store.ts` 使用独占单写入连接、事务和修订比较。测试预算在派发前占位，19 分钟停止新派发并预留最后一分钟。重启不补回额度；终态不能重新变为运行态。
3. `src/skills.ts` 为固定人工夹具封存原始字节、可执行位和资源路径；目录只读，拒绝符号链接，32 文件/1 MiB 上限。它没有接收并安全归档模型任意输出的权限。
4. `src/worker.ts` 复用 tools.restrict 与单调 guard。后续通用文件操作、组合工具和受限执行世界需在 G2 单独完善。
5. `src/usage.ts` 包裹 llm/stream。底座摘要器遗漏 reasoningEffort，插件只为已注册 G0 压缩请求补入用户批准的 High；其他配置不符直接拒绝。
6. 深入源码发现 DeepSeek 的图片 Files API 回退可能在一次 llm/stream 内再次发出 HTTP。G0 的纯文本/脚本探针未经过该路径，不能宣称对任意图片请求实现了逐 HTTP 尝试计量。RSI 扩展到图片前必须增加供应商派发事件或明确拒绝该路径。
7. 会话归属集合目前由可信测试辅助模块在调用前登记；持久化业务任务、子调用继承、历史补账是后续 Gate 的工作。Web 仅展示当前所选 Harness 会话与 RSI 探针，没有混合统计多个日常会话。
8. `scripts/host-probe.ts` 是额外本地覆盖层，不随安装包发布，也没有自动付费入口。当前数据库不提供预算重置或生产启用命令。

## 可重复检查

README 给出安装和开发命令。当前通过 TypeScript strict（宿主与客户端分开）、构建、6 项 Node 检查、git diff --check 和源代码 Tab 检查。

- `npm test`：事务、预算恢复、真实 Skill/Tool registry、流归并、原生重试；不访问网络或 Docker。
- `scripts/docker-probe.ts`：固定摘要镜像上的生命周期检查，需要本机 Docker。
- `scripts/http-probe.mjs`：已认证本地 RPC、持久化与长轮询检查，不调用模型。
- `scripts/run-host-probe.mjs offline`：真实宿主 Agent 创建与恢复，不调用模型。
- `live` 和 `compression`：仅在当批授权与预算允许时运行，不以重新启动服务重置预算。

首次 Docker 运行时发生过清理超时。初始化完成后已按唯一容器 ID 删除并核实。随后发现 attach 超时可能返回成功退出码，现已用 AbortSignal 和实际容器状态判断，再通过 label 找回并清理已创建资源。重测全部通过，未把早期失败计为通过。

## 收尾与下一步

最终本地安装包位于 `.cache/b1ackb-deepseek-rsi-0.0.0-g0.tgz`，SHA-1 为 `cf1fce24c328778eb1bb9fcdf534723b07d21115`。已安装在隔离 Web profile，未发布到 npm。重新安装后的 HTTP 检查通过，快照通知 5 ms；浏览器实际选中日常探针后显示 1,432 Token，RSI 区保持 3,594 Token，没有重复归账。测试标记保留，首批探针通过 Web 取消并持久化到修订 26。

最终收尾复核：3080 无监听，本次 Harness PID 已退出，OrbStack 应用与 VM 均未运行；临时测试浏览器页已关闭，原有用户页保留。Harness 的 git status 为空。镜像、插件安装与历史证据文件保留，未保留运行中的测试资源。

下一步先补齐 usage 到浏览器绘制的端到端时延证据，再讨论 G1 的任务信号、受管 Skill 清单与业务 schema。本批 20 分钟在线窗口已结束；如需要额外真实调用，须先确定新的具体批次和预算，不能清空旧账本续用。
