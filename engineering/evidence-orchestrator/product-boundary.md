# Evidence Orchestrator 产品边界决定

- **Decision ID**：EOV5-015-A
- **状态**：Accepted
- **决定日期**：2026-07-14
- **决定者**：产品负责人（人工）
- **选择**：方案 A — 当前项目的内部研发工具

## 人工决定

> 整个 Pi 编排器只在当前项目中使用，以 Evidence 为例，辅助 Evidence 项目开发。

Evidence 是被开发和验证的领域建模产品；Evidence Orchestrator 是这个仓库中的项目本地 Pi 工具。Orchestrator 不作为 Evidence 面向用户的产品能力、bounded context、运行时或 API 提供。

## 边界

### Evidence 产品知识

以下内容只表达领域建模用户的目的与行为：

- `docs/product/` 中的画像、业务上下文、用户旅程和故事地图；
- `.evidence/` 中的产品领域实体、关系和回归场景；
- `docs/architecture/context-map.md` 中的产品上下文及运行时集成；
- `contracts/` 与 `apps/*`、`libs/*` 中的产品行为。

### 内部研发知识

以下内容描述如何开发 Evidence，不构成产品承诺：

- `.pi/extensions/evidence-orchestrator/` 的状态、执行、保护和审计；
- `.pi/agents/`、`.pi/skills/` 与 `.pi/prompts/`；
- `engineering/evidence-orchestrator/` 的测试工序、Working Knowledge 和 DoD；
- `artifacts/iterations/` 中的需求快照、决定和执行证据。

Orchestrator 的直接使用者是当前仓库的产品负责人、领域专家和开发贡献者，他们在开发活动中担任 Navigator 或专业角色；这些内部角色不是 Evidence 产品 persona。

## Dogfooding

Orchestrator 可以用 Evidence 自身的 Issue、产品文档、`.evidence` 模型、测试和实现来验证知识循环。这是 dogfooding：验证内部工具能否辅助交付 Evidence，而不是证明 Evidence 产品向用户提供 Issue 编排、TQA、TDD 或 Respond 能力。

Dogfooding 事实不得自动写入产品能力、用户旅程、故事地图或 `.evidence`。只有领域建模用户可观察到的行为，才可能成为 Evidence 产品候选知识。

## 后果

- 从 Evidence 主产品文档中移除内部交付画像、旅程和故事地图活动。
- Orchestrator 代码不进入产品 context map，也不被产品 runtime 依赖。
- 项目 README 可以说明如何使用内部工具，但必须与“产品能力”明确分区。
- 当前工具不承诺对外兼容性、独立 onboarding、公共 API、支持策略或产品路线图。
- 将来若要提供给其他项目或外部用户，必须建立新的产品边界决定和独立上下文；不得把本决定静默解释为方案 B。
