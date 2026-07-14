# Evidence 工作知识治理

## 权威映射

| 知识         | 权威来源                                                  | Iteration 中的表示形式             |
| ------------ | --------------------------------------------------------- | ---------------------------------- |
| 需求请求     | GitHub Issue / Projects                                   | 冻结的 `issue.json` 与只读投影     |
| 产品解决方案 | `docs/product/`                                           | 问题、旅程切片与候选产品知识 delta |
| 软件交付方法 | `engineering/evidence-orchestrator/`                      | 本轮反馈、选择和执行证据           |
| 领域模型     | `.evidence/`                                              | 模型快照、delta 与场景展开         |
| 架构         | `docs/architecture/`                                      | 场景设计与架构 delta               |
| API 契约     | `contracts/api.yaml`                                      | API 契约 delta                     |
| 数据模型     | Migrations、Prisma schema 和 SeaORM entities              | 数据模型 delta                     |
| 测试工序     | `engineering/evidence-orchestrator/test-processes/`       | 选定工序的不可变快照               |
| 完成定义     | `engineering/evidence-orchestrator/definition-of-done.md` | Git 版本与场景附加条件             |
| 执行与反馈   | `artifacts/iterations/`                                   | 追加式、单轮证据                   |

`docs/product/` 只描述 Evidence 用户、问题、能力和产品旅程。Orchestrator 的角色、WIP、阶段、Gate、测试与学习旅程属于工程知识，不得包装成产品能力或产品用户故事。

## 知识提升生命周期

1. Kickoff 将问题与相关权威知识冻结为本轮基线。
2. TQA 和具体示例把候选知识显性化，但候选知识尚不是产品事实。
3. 模型展开、Model Checker、测试和可运行软件持续寻找反例。
4. Showcase 由领域专家判断可观察价值与模型解释是否成立。
5. Learn 将每项候选变化记录为 `promoted`、`deferred` 或 `rejected`。
6. `promoted` 条目更新唯一权威目标；原始 delta 和执行日志作为审计证据保留。
7. 下一轮从已更新的权威知识和新的冻结 Issue 快照开始。

## Iteration 证据规则

- 统一知识是基线；iteration 通过稳定 ID 和路径引用它，不复制整份画像、旅程、模型、架构、工序或 DoD。
- Delta 只记录候选新增、修正或删除，以及依据、影响和待验证事项；不要写“无变化”占位文档。
- Story Card 只表达角色、问题、价值与成功信号；Conversation 保存 TQA；Confirmation 保存具体 Given/When/Then。
- 非目标不是反向需求。只有已确认范围内的拒绝、失败和边界行为才进入示例与测试。
- 一个 iteration 只激活一张 Story；编码只激活其中一个最小场景。其他候选项返回 GitHub backlog，而不是在状态中并行暂停。
- 模型、源码、测试和契约的事实保留在各自权威来源；iteration 只保存快照引用、delta、检查结果与执行事实。
- 命令事实以 `*.execution.jsonl` 为唯一来源；人工可读报告不得手填或复制退出码、哈希和时间。

历史 bootstrap 证据的归档说明见 `artifacts/iterations/README.md`；归档内容不按新流程回填或改写。
