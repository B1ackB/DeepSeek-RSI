# DeepSeek RSI

一个独立维护、计划作为 DeepSeek Harness 外部插件交付的个人 Skill 优化工程。

插件从日常任务中发现优化机会，由用户选择方向并授权后，隔离修改 Skill 文本与 Python/Shell 脚本，通过固定评测形成证据，再由用户决定是否启用。日常会话与 RSI 任务分别展示 Token 用量。

## 当前状态

已完成需求、源码研究、开发规范和 G0 契约规划。当前仓库只有开发基线与文档，尚无可安装插件，G0 接入验证尚未通过。

- 开发遵循 ponytail full，代码使用 Tab 缩进。
- 第一版面向本机 Docker，使用 OrbStack；安装安排已确认，尚未执行。
- 修改、启用和覆盖原 Skill 分别遵守框架中的授权规则。
- 测试完成后关闭本次启动的服务、进程和容器，除非用户要求保留。

## 文档入口

| 文档 | 内容 |
|---|---|
| [FRAMEWORK.md](FRAMEWORK.md) | 产品范围、架构、G0–G5 交付与验收 |
| [CONTRACTS.md](CONTRACTS.md) | 核心规则、G0 字段与状态契约、已确认的测试预算 |
| [AGENTS.md](AGENTS.md) | 开发规范、边界校验、验证和清理要求 |
| [SOURCE-REVIEW.md](SOURCE-REVIEW.md) | 相关项目的源码依据、可借鉴机制与限制 |
| [HARNESS-LOCAL.md](HARNESS-LOCAL.md) | 本机 Harness 安装记录、运行方式与验证边界 |

## 开发起点

`main` 保存初始规划基线，G0 开发分支为 `codex/g0`。开始实现前阅读框架与契约，再核对实际 Harness 源码和环境。

第一条交付链路为：独立插件加载 → 最小 Web 面板 → 测试标记写入 → 刷新后持久保留 → 拒绝过期写入。随后验证 Skill 版本绑定、工具边界、容器生命周期及请求用量归属。

包配置、可执行 schema、构建与测试命令将在 G0 中建立。模型凭据由 Harness 管理，运行数据保存于独立 DSH_HOME，不提交到本仓库。
