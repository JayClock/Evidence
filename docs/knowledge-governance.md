# Evidence 工作知识治理

## 权威映射

| 知识         | 权威来源                                                  | 迭代中的表示形式                          |
| ------------ | --------------------------------------------------------- | ----------------------------------------- |
| 需求请求     | GitHub Issue / Projects                                   | 冻结的 `issue.json` 与只读投影            |
| 产品解决方案 | `docs/product/`                                           | 问题陈述、旅程切片以及产品 / 故事地图增量 |
| 领域模型     | `.evidence/`                                              | 模型快照、增量和场景展开                  |
| 架构         | `docs/architecture/`                                      | 架构决策和场景上下文映射                  |
| API 契约     | `contracts/api.yaml`                                      | API 契约增量                              |
| 数据模型     | Migrations、Prisma schema 和 SeaORM entities              | 数据模型增量                              |
| 测试工序     | `engineering/evidence-orchestrator/test-processes/`       | 已选定的不可变工序快照                    |
| 完成定义     | `engineering/evidence-orchestrator/definition-of-done.md` | Git 版本与场景特有的附加条件              |
| 执行与反馈   | `artifacts/iterations/`                                   | 不可变的执行证据                          |

## 知识提升生命周期

1. Frame 及后续阶段将候选知识变化记录为迭代增量。
2. 场景验证候选知识是否能够解释并支持真实行为。
3. Review 评估产品价值、架构适配性和质量。
4. Learn 在 `knowledge-promotion.json` 中将每项增量记录为 `promoted`、`deferred` 或 `rejected`。
5. 被提升的条目更新其权威目标，同时保留原始增量作为审计证据。
6. 下一轮迭代从更新后的统一知识和新的冻结 Issue 快照开始。

## 迭代增量编写规则

- 统一知识文档是基线：迭代工件应引用其路径及相关标题、活动或步骤 ID，而不是复制其中的表格、列表或正文。
- 增量只记录候选的新增、修正或删除，以及其依据、影响和待验证事项。仍由基线承载的知识不应额外写成“无变化”条目。
- `problem-statement.md` 可以保留解释 Issue 所需的最小基线上下文；其他 requirements 工件应引用它，而不是重复角色、价值、范围或非目标。
- Frame 为候选 P0/P1 分配稳定的 `US-xxx` ID 并生成独立故事卡；`story-map-delta.md` 直接引用这些 ID，不保留等待 Clarify 再映射的临时候选 ID。
- `journey-slice.md` 标识受影响的基线旅程步骤，再记录本轮改变的路径、结果和边界情形。`story-map-delta.md` 只列出受影响活动和候选故事，绝不复制完整活动主干。
- 候选事实在 Learn 提升前始终属于迭代增量；不得将其表述为既定产品事实，也不得过早复制到统一知识中。

历史迭代（包括 `ITER-0000`）即使其中复制的知识已过时，也绝不重写。
