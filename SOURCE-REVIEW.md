# DeepSeek RSI：相关项目源码研究

研究日期：2026-09-07。对应需求与实施方案：[FRAMEWORK.md](FRAMEWORK.md)。

## 1. 结论与证据范围

建议继续独立开发 DeepSeek Harness 原生 RSI 插件。首版用 TypeScript 实现一个受控的串行优化流程，复用宿主模型、Agent、Skill provider、Web 通道；Python/Shell 是候选技能和评测环境的一部分，不额外引入一套 Python Agent 运行时。

这不是因为没有相似实现：**SkillOpt 仓库已经包含 DeepSeek Harness 插件 `plugins/dsh`**，必须修正前次仅基于网页搜索而遗漏这一点的认识。但它当前是将 Python CLI 包装成模型工具的接入层，尚未覆盖本项目的原生会话观察、Web 审阅、脚本候选隔离、完整分账及两阶段授权。

本次对 6 个主要项目追踪了核心调用链，对 Hermes、DGM 做了定点对照。所有源码浅克隆到临时目录；未安装依赖、未运行第三方 Agent、未调用模型、未运行容器或定时任务。读取了相关测试源码，但没有执行，不能把测试存在写成测试通过。以下缺口均限定在所列提交与路径，不是对项目全部能力或安全性的笼统结论。

## 2. 固定源码版本

| 项目 | 本次读取的提交 | 研究范围 |
|---|---|---|
| [EvoSkill](https://github.com/sentient-agi/EvoSkill/tree/36f6f04952293d7054145550c2b9f0b0411bff1c) | `36f6f04952293d7054145550c2b9f0b0411bff1c` | 循环、候选生成、Git 版本、评分与费用累积 |
| [SkillOpt](https://github.com/microsoft/SkillOpt/tree/79124b37e9a6371e13b753f8bcd7adb1e493ade1) | `79124b37e9a6371e13b753f8bcd7adb1e493ade1` | Sleep 主链、验证、采纳事务、预算、DSH 插件 |
| [Memento-Skills](https://github.com/Memento-Teams/Memento-Skills/tree/ee9b9a45efd093d669c06fe318b4b1dceb246d19) | `ee9b9a45efd093d669c06fe318b4b1dceb246d19` | 失败归因、文件重写、候选测试、部署和回滚 |
| [retro-skill](https://github.com/netresearch/retro-skill/tree/72e03f250ec6b7b87c31548e899ef6eb5c157851) | `72e03f250ec6b7b87c31548e899ef6eb5c157851` | 机械信号、提案流程、提醒钩子、审批指令 |
| [GEPA](https://github.com/gepa-ai/gepa/tree/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407) | `0632cdb5dcc052e690eab439e1b4a7e3e9cfe407` | 接受与选择、评估预算、反思模型计量 |
| [Janus](https://github.com/magnetoid/janus/tree/f7c72d0ff082897a366f28ee79d25cd4888620a4) | `f7c72d0ff082897a366f28ee79d25cd4888620a4` | 评估、批准、启用门槛、评测隔离 |
| [Hermes](https://github.com/NousResearch/hermes-agent/tree/22c5684b983eac6a81ee015ae80296c4b3dbf5bb) | `22c5684b983eac6a81ee015ae80296c4b3dbf5bb` | Skill 文件操作、暂存审批、写入账本 |
| [DGM](https://github.com/jennyzzt/dgm/tree/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2) | `a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2` | 父代选择、候选档案、诊断与编码评测 |
| [DeepSeek Harness](https://github.com/B1ackB/deepseek-harness/tree/d347e703908d0406b7a7ef80e3a0e594d86b2215) | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | 本地实际 checkout 的插件、存储、Skill、流式用量、重试 |

临时 checkout 位置：`/private/tmp/deepseek-rsi-source-review-20260907/`。后续可删除，不属于产品依赖；上表和链接足以重新获取相同版本。

## 3. EvoSkill：学习候选循环，不复制运行中切分支

### 实际调用链

`CLI run / Python API → SelfImprovingLoop.run → 基线评估 → 训练样本执行 → 收集失败 → proposer → generator → ProgramManager 创建并提交候选 → 验证集评分 → 更新 frontier → 保存反馈与采样 checkpoint`。

源码依据：

- [src/cli/commands/run.py](https://github.com/sentient-agi/EvoSkill/blob/36f6f04952293d7054145550c2b9f0b0411bff1c/src/cli/commands/run.py)：CLI 组装并调用循环。
- [src/loop/runner.py](https://github.com/sentient-agi/EvoSkill/blob/36f6f04952293d7054145550c2b9f0b0411bff1c/src/loop/runner.py)：`run`、`_mutate`、`_mutate_with_fallback`、`_evaluate`。
- [src/registry/manager.py](https://github.com/sentient-agi/EvoSkill/blob/36f6f04952293d7054145550c2b9f0b0411bff1c/src/registry/manager.py)：`switch_to`、`update_frontier`、`commit`、`discard`。

### 可借鉴

- 先取得基线，再根据具体失败提出修改；将“为什么改”和“如何改”写入反馈。
- 明确候选的父版本、分数和完整内容；后续迭代有可追溯的来源。
- 将生成器与评估器分开，评估结果由外部运行与评分获得。

### 不能照搬的地方

1. **搜索池不等于不退化门槛。** `update_frontier` 在池未满时直接保留候选；满时只需超过最差成员。因此 `added=True` 不能证明候选优于父代或起始版本。循环还会在 added 时清零无改进计数。本项目以冻结的目标契约判断进展，绝不以“进入候选池”判断改善。
2. **运行目录会切分支。** `switch_to` 使用 Git checkout，并有自动 stash/apply。适合离线实验目录，但会与日常读取 Skill 的会话争用文件。本项目使用独立副本和不可变对象目录，ACTIVE 与搜索参考分开。
3. **只有失败才提案。** 样本全部通过时直接 continue，这不能满足“已经答对，但想更简洁/更省 Token”的用户目标。本项目允许正确任务上的效率与偏好优化。
4. **汇总费用不足以做权威预算。** `_total_cost` 的轮末累加位于提前 continue/break 之后，这些路径存在跳过当前轮费用累积的情况；checkpoint 主要保存采样位置，不持久化完整请求账本。此处是静态控制流发现，未做运行复现。本项目必须在每个请求尝试的生命周期记账，而非只在轮末累加。
5. 本项目保留失败候选与证据；不以删除候选分支代替审计保留。

## 4. SkillOpt-Sleep：最强的审阅与写回参考

### 实际调用链

`cycle.run_sleep_cycle → harvest_for_config → 任务挖掘/冻结划分 → consolidate → train 反思与有界文本编辑 → val gate → fresh final val → write_staging → 独立 adopt`。

源码依据：

- [skillopt_sleep/cycle.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/cycle.py)
- [skillopt_sleep/consolidate.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/consolidate.py)
- [skillopt_sleep/staging.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/staging.py)
- [skillopt_sleep/config.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/config.py)

### 可借鉴

- `_split` 区分 train/val/test；发现 train/val 混用时标记泄漏，不能认证改善。`_task_deltas` 把缺失及非有限分数视为不合格证据。
- 中间编辑通过后仍做最终新回放，最终失败则修正已应用/拒绝的编辑记录，避免报告与实际结果不一致。
- 暂存时绑定原文件真实路径、原始字节摘要及候选摘要。`adopt`/`adopt_skills` 在锁内重读清单、复核摘要、识别重复采纳，拒绝过期内容。
- 写回使用 `.adopt-transaction.json`、备份、收据和恢复流程；这是本项目 G5 多文件覆盖的重要参考。不能只复制一句 `os.replace` 就认为获得同等恢复能力。
- [test_gate_no_regression.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/tests/test_gate_no_regression.py) 覆盖中间/最终退步、缺失结果和非有限分数，适合借鉴测试意图。本次未执行。

### 差异与限制

- 核心 gate 要求比较分数严格增加；默认 `gate_metric=mixed`，`gate_no_regression=false`。本项目改成先过关键正确性和准确率门槛，再判断用户目标，不允许软分抵消准确率下降。
- 默认 `test_fraction=0.0`，不能宣称默认已有独立最终测试集。源码中的 test 评分主要作为报告证据；本项目必须明确哪些保留题是启用前的阻断条件。
- `staging` 的目标约束主要是 Markdown 文件；不能把它当作完整 Python/Shell 技能包的版本系统。
- `config.py` 有 `max_tokens_per_night`，`budget.py` 有预算类，但本次全仓 Python 搜索中，该配置字段仅找到定义；标准 cycle 未见调用它来阻止请求。不能据此承诺 Token 硬限额。
- `auto_adopt` 是可开启选项；本项目第一版不提供自动启用配置。

### 4.1 已存在的 DeepSeek Harness 插件：必须纳入对照

[plugins/dsh/src/index.js](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/plugins/dsh/src/index.js) 注册七个工具，调用 `ctx.shell.resolve/run` 启动 Python CLI；[package.json](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/plugins/dsh/package.json) 声明 bundle patch。

| 接入内容 | 源码事实 | 对本项目的含义 |
|---|---|---|
| 原生工具 | status / dry-run / run / adopt / harvest / schedule / unschedule | 可以研究工具注册与打包；不需要再验证“能否包装一个 CLI”这一概念 |
| Harness 日志 | `source` 枚举和 `harvest_sources.py` 均未提供 dsh 来源 | “在 DSH 里调用”不等于“学习 DSH 会话”；必须自己做 Session 事件接入 |
| 模型调用 | Python backend/外部 CLI 执行，不通过该插件的 `ctx.llm` | 不会自然进入本项目要求的 Harness 请求分账链 |
| 修改/启用授权 | `adopt` 是模型可调用工具；该 execute 未见绑定用户、候选摘要与授权范围的检查 | 宿主可能还有通用工具权限，但这不能代替 RSI 的精确任务授权与启用批准 |
| Web | package 未声明 `dsh.client`，入口未注册浏览器面板 | 四区 RSI 页面需要自己实现 |
| 执行 | 宿主 Shell 包装 Python，传递 signal/timeout | 不能推导成候选脚本已在无网络 Docker 中执行 |
| 计量 | 返回收集后的 stdout/stderr；未见请求级实时用量事件 | 总费用与分账需另行建立 |
| 定时运行 | 工具允许安装/移除 nightly cron | 与本项目按任务授权、用完清理的首版范围不同；首版不启用 |
| 接入测试 | `canary.mjs` 使用真实打包产物，但 Shell 为 rc.8 形状的 fake | 是包装/参数测试，不能替代当前 alpha.1 宿主的端到端验证 |

出处：[harvest_sources.py](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/skillopt_sleep/harvest_sources.py)、[canary.mjs](https://github.com/microsoft/SkillOpt/blob/79124b37e9a6371e13b753f8bcd7adb1e493ade1/plugins/dsh/scripts/canary.mjs)。

因此，不建议直接安装它并把未覆盖的要求留给 Skill 文案。可在未来另设兼容实验；当前不把它作为运行时依赖。

## 5. Memento-Skills：文件级修复与失败归因

实际路径：`skill_dispatch/dispatcher → gateway.evolve_failure → SkillEvolutionEngine.evolve_failure → _attribute → _evolve_attributed → copytree → _rewrite → _apply_replacements → static/unit/synthetic tests → 选择最佳候选 → 替换原目录/回滚`。

核心依据：[core/skill/evolution/engine.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/core/skill/evolution/engine.py)、[core/skill/gateway.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/core/skill/gateway.py)、[shared/schema/skill_config.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/shared/schema/skill_config.py)。演化默认关闭。

可借鉴：归因只能选择实际候选技能；候选文件替换有目录范围检查；Skill 名称不能悄悄改变；失败候选、备份与事件证据分别保存；按 Skill 的锁防止本进程并发修复。

需改造：

- `_static_and_unit_tests` 用宿主 `sys.executable -m pytest` 在候选 cwd 执行。工作目录不同不限制进程对 HOME、网络或子进程的访问。本项目所有候选脚本与候选自带测试进入 Docker。
- 重写模型同时提出 `synthetic_test` 和 `pass_criteria`；局部测试也位于可重写技能目录。它们可以验证修改假设，不能成为唯一可信评分依据。本项目冻结答案和判定器由宿主保管，候选不能修改。
- 这里按候选测试挑选最佳后直接部署，没有本项目要求的“对固定基线不退化，再由用户单独启用”。
- `os.replace(skill_dir, backup)` 与 `os.replace(candidate, skill_dir)` 是两次操作，异常处理可恢复，不代表进程硬崩溃时没有空窗。我们的日常启用只改数据库指针；写回原目录留到 G5 做恢复验证。
- LLM 给出的归因 confidence 是建议，不是已校准概率，不能作为权限或自动改写的依据。

相关测试：[core/skill/tests/evolution/test_engine.py](https://github.com/Memento-Teams/Memento-Skills/blob/ee9b9a45efd093d669c06fe318b4b1dceb246d19/core/skill/tests/evolution/test_engine.py)；本次只读。

## 6. retro-skill：小而可解释的机会发现

[detect-mechanical.py](https://github.com/netresearch/retro-skill/blob/72e03f250ec6b7b87c31548e899ef6eb5c157851/skills/retro/scripts/detect-mechanical.py) 提取工具错误、重试簇、冗长工具输出、重复读取、用户纠正和相似命令形状，之后由模型分类。

[SKILL.md](https://github.com/netresearch/retro-skill/blob/72e03f250ec6b7b87c31548e899ef6eb5c157851/skills/retro/SKILL.md) 组织分析、提案、逐项审批、修改来源仓库；[session-end.json](https://github.com/netresearch/retro-skill/blob/72e03f250ec6b7b87c31548e899ef6eb5c157851/hooks/session-end.json) 默认不启用，只提醒用户运行复盘，不调用模型。

本项目借鉴 5 类简单信号：脚本非零退出、短时间重复尝试、同文件重复读取、大量重复片段/输出、明确简洁或成本偏好。规则只负责提示；一次错误不直接证明 Skill 有错。提案需要保留事件引用并说明可能是凭证、环境或题目本身导致的问题。

不能照搬全部规则与组织习惯，例如分支约定、提交署名、PR 流程和跨项目规则传播。它们不是本项目用户确认的需求。其审批主要由 Skill 流程表达；本项目把授权检查放在宿主状态变更入口。

前身 Coach 被维护者归档并报告过提案堆积问题，提示我们加去重、冷却、数量限制及忽略反馈，但不据此取消用户已确认的本地规则观察方式。

## 7. GEPA：未来可选搜索器，不接管产品控制权

[core/engine.py](https://github.com/gepa-ai/gepa/blob/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407/src/gepa/core/engine.py) 将反思、接受准则、候选选择和验证组合成搜索流程；默认严格改善，也有接受持平的策略。选择器对哪些候选继续评估有自己的决定权，因此不能把库内部的 accepted 直接映射为本项目 READY_FOR_USER。

[oa/budget.py](https://github.com/gepa-ai/gepa/blob/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407/src/gepa/oa/budget.py) 明确只管理评估调用次数，提案模型费用归引擎负责。[cost-tracking.md](https://github.com/gepa-ai/gepa/blob/0632cdb5dcc052e690eab439e1b4a7e3e9cfe407/docs/docs/guides/cost-tracking.md) 说明普通 callable 的 Token 可能按字符估算、费用可能为零；这种零不能当成真实免费。

首版只有 3 个串行候选，最简 best-so-far 流程即可。暂不引入 GEPA/DSPy 依赖、Pareto 搜索和多代理提案。只有固定题集已证明简单循环效果不足，再将 GEPA 接入候选生成位置；所有评估、请求账本与启用授权仍由本插件拥有。

## 8. Janus：审批入口有参考价值，判定标准不同

[agent/self_improve.py](https://github.com/magnetoid/janus/blob/f7c72d0ff082897a366f28ee79d25cd4888620a4/agent/self_improve.py) 提供 `propose → record_evaluation → approve → can_promote → promote → rollback`。`can_promote` 检查评测证据、目标范围、评测历史、运行健康、费用限制与人工批准。复评会重置为 evaluated，避免旧批准不经新审阅继续使用。

[agent/eval_orchestrator.py](https://github.com/magnetoid/janus/blob/f7c72d0ff082897a366f28ee79d25cd4888620a4/agent/eval_orchestrator.py) 的隔离复制 skills/evals 到临时 home，再设置 home override；仅凭此函数不能声称有操作系统执行隔离。`_compute_gate` 允许配置的平均分 epsilon，并用特定通过率下降区间做回归否决，不等于本项目固定准确率不下降。

本项目借鉴“每次启用重新检查门槛”和“评估后才能批准”，但不引入完整健康治理平台、不开放渐进免审批，也不复用其 shaped reward 代替正确性。

## 9. Hermes 与 DGM 的定点对照

Hermes 当前 [skill_manager_tool.py](https://github.com/NousResearch/hermes-agent/blob/22c5684b983eac6a81ee015ae80296c4b3dbf5bb/tools/skill_manager_tool.py) 已有 create/edit/patch/write_file/remove_file、暂存审批及写入前后账本，不能把它简单描述为“只积累记忆、没有审批”。但 `_run_write_gate` 导入审批模块失败时返回 None，允许继续执行；本项目的权限检查不可用时必须阻断修改。此处是特定工具路径的代码事实，不代表已完成 Hermes 全部旁路审计。

DGM 的 [DGM_outer.py](https://github.com/jennyzzt/dgm/blob/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2/DGM_outer.py) 选择父代、保留探索档案；[self_improve_step.py](https://github.com/jennyzzt/dgm/blob/a565fd2d1dca504ef5104a7cc0f3bdc4ab9b4fd2/self_improve_step.py) 根据失败诊断生成代码修改并评测。可以借鉴完整 lineage 和诊断证据，但整 Agent 自改与开放式档案搜索超出首版。

## 10. 对原框架的直接修订

| 原框架主题 | 研究带来的明确决定 |
|---|---|
| 插件形态 | 继续独立仓库、一个原生插件包；已有 dsh-skillopt 是对照实现，不直接等同于所需产品 |
| 观察与分析 | 本地机械信号、去重冷却、点击后模型分析；不扫描其他 Agent 的全部个人历史 |
| 修改范围 | SKILL.md + 授权 Python/Shell/资料；候选生成使用隔离副本，原目录不切分支 |
| 验收 | 正确性门槛和用户目标分开；持平但简洁可接受；不使用一个混合总分掩盖退步 |
| 测试 | 候选自带测试与合成测试仅补充；冻结私有判定器拥有最终评分权 |
| 搜索 | 一次一个 Skill、全局一个正在执行的 RSI 优化任务、最多 3 个串行候选；不建 frontier 平台 |
| 存储 | Harness storage-domain 仅单记录写入，无跨表事务；需要一致提交的权限/版本/账本使用插件自有一个 SQLite 数据库 |
| 计量 | 宿主请求尝试级持久账本，日常与 RSI 互斥归属；未知不当零；所有提前返回路径也结算 |
| 启用 | 独立 Web 操作、内容与报告摘要绑定、数据库 ACTIVE 指针切换；新增会话使用新版 |
| 覆盖原目录 | G5 才开放；借鉴 SkillOpt 的摘要、锁、恢复日志与冲突拒绝，不直接自动 adopt |
| 清理 | 测试启动的 Harness 与容器结束后关闭；无 nightly daemon/cron；产品运行中用户关闭页面的语义另行保留 |

## 11. 复用策略与下一步

本次没有复制第三方实现，也没有添加运行时依赖。采用的是经源码核对的方法与约束。后续若实际复制文件或较大代码段，按对应提交的 LICENSE、NOTICE 和文件头保留许可及归属；retro 的指令内容与脚本存在不同许可证，不能只看仓库名判定。

下一步先做原生外部插件 G0：安装、Web 通道、一个受管 Skill 的会话固定绑定、一个真实请求的归属、一个 Docker 工具调用与取消清理。通过后再实现优化算法。不能先运行 dsh-skillopt 的 mock demo，就报告本项目已具备受控 RSI 或真实效果提升。
