# Evidence 工作知识治理

## 产品与内部工具边界

人工产品决定 [`EOV5-015-A`](../engineering/evidence-orchestrator/product-boundary.md) 将 Evidence Orchestrator 定义为当前仓库的内部研发工具。`docs/product/` 与 `.evidence/` 只承载 Evidence 建模平台的用户知识；`.pi/`、`engineering/evidence-orchestrator/` 和 `artifacts/iterations/` 承载如何开发该产品的工作知识与证据。用 Evidence 自身验证 Orchestrator 属于 dogfooding，不会自动产生产品能力。

## 权威映射

| 知识         | 权威来源                                                   | 迭代中的表示形式                          |
| ------------ | ---------------------------------------------------------- | ----------------------------------------- |
| 需求请求     | GitHub Issue / Projects                                    | 冻结的 `issue.json` 与只读投影            |
| 产品解决方案 | `docs/product/`                                            | 问题陈述、旅程切片以及产品 / 故事地图增量 |
| 领域模型     | `.evidence/`                                               | 模型快照、增量和场景展开                  |
| 架构         | `docs/architecture/`                                       | 架构决策和场景上下文映射                  |
| API 契约     | `contracts/api.yaml`                                       | API 契约增量                              |
| 数据模型     | Migrations、Prisma schema 和 SeaORM entities               | 数据模型增量                              |
| 测试工序     | `engineering/evidence-orchestrator/test-processes/`        | 已选定的不可变工序快照                    |
| 方法工作知识 | `.pi/skills/`、`.pi/prompts/` 与 Working Knowledge catalog | 实际加载版本、使用场景和反馈证据          |
| 完成定义     | `engineering/evidence-orchestrator/definition-of-done.md`  | Git 版本与场景特有的附加条件              |
| 执行与反馈   | `artifacts/iterations/`                                    | 不可变的执行证据                          |

## Working Knowledge 分层

- Extension 只承担确定性状态、执行、路径保护和审计；不得隐藏业务或交付方法。
- Agent 只定义隔离角色、可用工具、停止条件与何时加载 Skill，不复制方法步骤。
- `Complicated` / `Complex` 工作通过 `.pi/skills/*/SKILL.md` 渐进加载；Skill 必须说明输入、方法、项目示例、反馈出口和停止条件，并提供 reviewable `evals/evals.json`。
- `Clear` 的结构检查、格式化和摘要使用 Pi 直接发现的 `.pi/prompts/*.md`，不启动重量级活动 subagent。Prompt 不做状态变更或人工决定。
- `engineering/evidence-orchestrator/working-knowledge-catalog.json` 是活动 Skill/Prompt 的目录，记录 ID、语义版本、负责人、认知行为、路径、已验证场景、最新反馈和 supersedes。`pnpm orchestrator:validate` 会拒绝未编目或不可发现的条目。
- activity task 只传本轮 Story/Scenario、输入路径、单一任务和停止边界；方法更新只修改 catalog 指向的 Skill/Prompt，避免 Agent、task 与文档三份漂移。

## 知识提升生命周期

1. Kickoff 与 Understand 将一个 Story/Scenario 的候选知识变化记录为迭代增量。
2. Understand 的独立模型挑战之后由人类确认模型与统一语言；Desk Check 在共享 Git baseline 应用精确候选，Pair 以 model refs → TASK/TEST → changed paths 验证候选知识能否解释并支持真实行为。
3. Showcase 重新观测 Q2，由人类记录实际产品行为与价值；`required` 的 Q3/Q4 活动必须执行并留下证据，未解决 concern 不能接受。
4. Respond 只对本轮实际使用并由 Scenario、Showcase 与执行事实验证的候选提出 `promoted`、`deferred` 或 `rejected`；测试工序、Skill、Prompt/CoT 也属于可审查的 Working Knowledge。
5. 人类逐轮确认 Respond 候选。`promotions: []` 合法，但必须说明为何没有可复用知识；`promoted` 必须给出 canonical target 和验证证据，`deferred/rejected` 只保留理由而不改变权威来源。
6. 被提升的条目更新其权威目标，同时保留原始增量、Showcase 决定和人工确认作为审计证据。未应用或未与实现共同验证的模型补丁不得提升。
7. Respond 输出一个明确待学习问题、依据与第一步行动作为 next Probe。更新 GitHub Issue 与创建新快照始终由人类明确触发；`complete` 只表示迭代边界。

## 迭代增量编写规则

- 统一知识文档是基线：迭代工件应引用其路径及相关标题、活动或步骤 ID，而不是复制其中的表格、列表或正文。
- 增量只记录候选的新增、修正或删除，以及其依据、影响和待验证事项。仍由基线承载的知识不应额外写成“无变化”条目。
- `problem-statement.md` 可以保留解释 Issue 所需的最小基线上下文、共享范围与非目标；除故事卡表达 Card 所需的角色、目标和价值外，其他 requirements 工件应引用它，而不是复制这些内容。
- 用户故事遵循 3C：`stories/US-xxx.md` 是简短的 Card，只包含带 ID 的标题、角色、可协商目标、价值和问题上下文链接；`clarifications/` 保存 Conversation；`examples/US-xxx-SC-xxx.md` 保存沟通确认后的 Confirmation，并由这些示例定义具体功能范围。
- Kickoff 每轮只提出一张未授权 Story 候选；人类确认后才分配稳定的 `US-xxx` 并生成独立 Card。Card 不得包含优先级队列、预生成问题列表或验收示例；Understand 只澄清这一张 Story，不支持批量选择或切换。
- 非目标不是反向需求：不得为了证明未要求或不存在的功能而创建验收示例、实现任务或测试代码。只有已确认范围内的拒绝、失败和边界行为才进入 Confirmation 与后续测试。
- `journey-slice.md` 标识受影响的基线旅程步骤，再记录本轮改变的路径、结果和边界情形。`story-map-delta.md` 只列出受影响活动和候选故事，绝不复制完整活动主干。
- 候选事实在 Respond 经人工确认前始终属于迭代增量；不得将其表述为既定产品事实，也不得过早复制到统一知识中。
- 每项 promotion 至少记录 `source`、`kind`、`decision`、`reason`、`validation_evidence[]` 和人工决定；只有 `promoted` 记录 `canonical_target`。目标文件存在本身不是验证。
- 模型路径与代码路径必须由同一 Git baseline 的 execution manifest 计算；每个 TEST/TASK 同时保留确认模型引用和实际 changed paths，任一候选内容、路径或追踪不一致时 Respond 不得完成。

历史迭代（包括 `ITER-0000`）即使其中复制的知识已过时，也绝不重写。
