# Evidence Definition of Done

本文件是团队统一完成标准。Iteration 不得复制或改写整份 DoD，只能引用当前 Git commit，并记录场景特有的附加条件。

## 所有增量

- 用户价值由一个明确的 `US-xxx / SC-xxx` Given/When/Then 场景定义。
- 场景已通过 `.evidence` 模型展开，概念、关系、不变量和时间线可解释。
- owning runtime、功能上下文、Q2/Q1、测试替身和工序追踪完整。
- 稳定知识写入统一知识源；iteration 仅保存输入、delta、决策和执行证据。
- 所有改动遵守 `AGENTS.md` 的模块和 runtime 边界。

## 编码

- 先产生预期行为失败的 Red，再完成最小 Green，最后安全 Refactor。
- 每项功能测试和实现都可追踪到已确认的 `US-xxx / SC-xxx`；没有对应验收场景的功能不生成生产代码或测试代码，非目标不产生反向测试。
- 已确认范围内的拒绝、失败和边界行为属于对应验收场景，应按所选测试工序验证。
- 同时存在真实测试和生产代码改动；Markdown 不替代实现。
- 受控 append-only `execution.jsonl` 是命令、退出码、输出摘要/哈希、计划哈希和 Git 工作树哈希的唯一原始执行事实；`manifest.json` 与可选 `summary.md` 只能由工具确定性生成，Agent 不手填命令、退出码或 changed paths。
- Showcase 重新观测已选 Q2 并展示确认的 Given/When/Then；Q3/Q4 均有带理由的显式风险决定，`required` 同时声明具体评价活动。只有人类 accept 才能进入 Respond。
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

## Review 与学习

- Review 对照验收示例、模型展开、统一架构、测试策略、工序和本 DoD。
- Critical 问题阻止完成；Major 问题必须修复或由 Gate 明确接受。
- Probe/Sense/Respond 反馈进入 iteration summary。
- 经确认的产品、模型、架构或工序知识已提升到对应统一知识源。
- 下一轮问题已更新到 GitHub Issue，旧 iteration 保持不可变。
