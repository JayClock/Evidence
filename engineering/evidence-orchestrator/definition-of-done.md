# Evidence Definition of Done

本文件是当前仓库开发 Evidence 的内部团队统一完成标准，不是 Evidence 产品向用户提供的能力或合同。Iteration 不得复制或改写整份 DoD，只能引用当前 Git commit，并记录场景特有的附加条件。

## 所有增量

- 用户价值由一张 `US-xxx` 及其人工确认的完整 `SC-xxx` Given/When/Then Scenario Set 定义。
- 全部场景已逐一通过 `.evidence` 模型展开和联合独立挑战，并由人类一次确认模型投影、跨场景一致性、概念、关系、统一语言、不变量、时间线及候选变更。
- owning runtime、功能上下文、Q2/Q1、测试替身和工序追踪完整；每个 Then 有 Q2，公共 Q1 已去重，Scenario → model refs → TASK/TEST → code paths 可复核。
- 稳定知识写入统一知识源；iteration 仅保存输入、delta、决策和执行证据。
- 所有改动遵守 `AGENTS.md` 的模块和 runtime 边界。

## 编码

- 每个批准的 TASK/TEST 分别先产生预期行为失败的 Red，再完成最小 Green，最后安全 Refactor；同一 process step 下的多个 TEST 不得合并完成。
- 每项功能测试和实现都可追踪到已确认的 `US-xxx` Scenario Set；没有对应验收场景的功能不生成生产代码或测试代码，非目标不产生反向测试。
- 已确认范围内的拒绝、失败和边界行为属于对应验收场景，应按所选测试工序验证。
- 同时存在真实测试和生产代码改动；Markdown 不替代实现。
- 受控 append-only `execution.jsonl` 是命令、退出码、输出摘要/哈希、计划哈希和 Git 工作树哈希的唯一原始执行事实；`manifest.json` 与可选 `summary.md` 只能由工具确定性生成，Agent 不手填命令、退出码或 changed paths。
- Showcase 重新观测已选 Q2，并由人类记录实际产品 Given/When/Then、业务数据和价值反馈；Q3/Q4 均有带理由的显式风险决定，`required` 的每项活动都有执行证据且没有未解决 concern。只有人类 accept 才能进入 Respond。
- Rust 与 Nest server track 不混合实现同一服务端能力。
- Domain 不依赖 HTTP、ORM、UI 或桌面框架；协议层不承载业务规则。

## 契约与持久化

- API 变化同步实现、`contracts/api.yaml`、契约测试和生成客户端。
- 新持久化行为同时考虑 fake/memory 与生产 adapter 的契约一致性。
- 所有查询遵守软删除和工作区边界。
- migration、Prisma schema 或 SeaORM entity 是数据模型事实来源；iteration 只记录 delta。

## 质量门禁

按所选测试工序执行全部 `quality_gates`。最低要求：

- TypeScript：相关 Nx test、typecheck、lint。
- Rust：相关 cargo test、clippy `-D warnings`、fmt check。
- Tauri：desktop cargo test、clippy 和 fmt check。
- Workflow：`pnpm orchestrator:test` 与 `pnpm orchestrator:validate`。

## Showcase 与 Respond

- 独立 Showcase Reviewer 对照验收示例、模型展开、统一架构、测试策略、工序和本 DoD；问题由人类按知识缺口路由。
- Probe/Sense/Respond 反馈进入 iteration summary；模型和代码使用同一 Git baseline，路径不一致时不得完成。
- 只提升被本 Story Scenario Set 实际使用、经执行与 Showcase 验证并由人类确认的产品、模型、架构、工序或 Skill/Prompt 知识；本轮无可复用知识时允许空 promotions，但必须说明原因。
- deferred/rejected 候选保留理由且不污染权威来源；未应用或未验证的模型补丁不得提升。
- 下一轮输出一个明确待学习问题及第一步 Probe。将 Probe 收集进 Inbox、提取 Story 候选和创建新 Intake 由人类在迭代边界后明确执行，旧 iteration 保持不可变。
