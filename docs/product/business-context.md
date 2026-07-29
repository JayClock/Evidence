# Evidence 产品业务上下文

本文件描述 Evidence 建模平台的长期产品业务知识。候选知识只有经过用户场景验证和产品负责人确认后，才能提升到这里；具体研发工作流不属于本产品上下文。

## 产品目的

Evidence 帮助领域专家和业务分析师收集可追溯来源、定义业务概念，将证据、参与者、角色和上下文组织成可审计、可演进的关系模型，并用图支持理解和评审。

## 核心业务能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **来源收集**：用户在 Workspace Inbox 捕获手工或 provider 来源，查看不可变 Revision，并明确选择 1–5 个 active Item 冻结 Extraction。
3. **交付准入**：本地 Inbox Analyst 只基于 Extraction 提出无 Story ID 的精确引用 Candidate；用户可 defer/reject，或选择一张 ready Candidate 创建 Iteration 与 Frozen Intake。
4. **Kickoff 确认**：Desktop provision 隔离 worktree；用户对 Frozen Proposal 执行 confirm/revise/split/defer/stop，只有 confirm 创建该 Iteration 唯一 `US-001`。
5. **理解与任务规划**：用户通过 TQA 明确业务不确定性，整体确认 Given/When/Then Scenario Set 和模型处置，再以 Desk Check 批准精确 Tasking Plan。
6. **本地 Pair 执行**：Desktop 在隔离 Git worktree 中按 Approved Tasking Plan 运行短生命周期 Driver、独立 Red Review、锁定命令和质量门，由用户审查完整 Story diff 后批准或路由修复。
7. **价值验证与知识响应**：Pair 批准后重新执行全部 Q2，记录实际产品观察和独立 Showcase Review；只有用户接受价值后才能提出 Respond 知识响应和 next Probe。
8. **逻辑模型编写**：在工作区定义 LogicalEntity 与 LogicalRelationship。
9. **图投影**：Diagram、DiagramNode 和 DiagramEdge 将逻辑模型投影为可视关系图；图元素不是逻辑实体本身。
10. **本地模型辅助**：Desktop AI Modeling Agent 读取远程模型，并以受限、认证的模型 command 响应用户明确请求。
11. **一致体验**：Web 是唯一前端产品；Desktop 通过 Electron 包装同一前端并消费相同 REST/HAL 语义。

## 核心规则

- Workspace 是成员、Inbox、逻辑模型和图的协作边界。
- 同一 source identity 的重复捕获是幂等的；每个不同 SHA-256 source snapshot 只保留一个不可变 Revision。
- Extraction 原子冻结用户选择的 1–5 个 exact latest Revision；Agent 不得替换来源。
- Candidate 是无 Story ID 的无权威提案；selection 只 claim Candidate、占用 WIP 并创建 Iteration/Frozen Intake，不能创建 Story。
- Frozen Intake 自包含 Candidate 与 Source Revision 快照；live Inbox 更新只能使未选择 Candidate stale，不能改写已有 Intake。
- confirm/revise/split/defer/stop 只能由当前认证用户触发。只有 Kickoff confirm 原子创建该 Iteration 唯一 `US-001`、Problem Statement、Lean Story Card 与 baseline Revision；revise 的 Agent 只能读取 Frozen Intake 和决定历史。
- 后续 Story Revision 必须基于 latest Revision，并保存至少一个有序 Given/When/Then Scenario；并发确认不能产生两个 latest。
- Pair 只能从人工 Desk Check 批准的精确 Tasking Plan 启动；Driver、Red Reviewer、命令观察和质量门都必须引用该 Plan 与当前 Story authority。
- Pair 的完整 Story 编码批准只能由用户提交；批准后创建 Showcase authority，只有用户接受 Showcase 才进入 Respond。
- Desktop repository 路径只保存在 Desktop binding store，不进入 Server Workspace metadata。
- LogicalEntity 可独立于 Diagram 存在；DiagramNode 只能引用逻辑实体。
- LogicalRelationship 的 source/target 必须引用工作区内存在的逻辑实体。
- DiagramEdge 可以表示一个 LogicalRelationship，但图边与逻辑关系生命周期不同。
- Pair Driver 和 Controller 不能自行接受变更或创建 commit；只有用户批准且本地 diff hash 与 Manifest 一致后才能 commit，不自动 merge/push。
- Web 与 Desktop 不得形成两套产品语义。

## 产品知识变更规则

- 候选 Feature 必须先明确产品用户、问题、价值与可观察场景。
- 只有经过场景验证和产品负责人确认的稳定知识才能合并到本文件。
- 技术实现、API、数据库、测试框架以及 Evidence Orchestrator 的内部交付流程不属于本产品业务价值，应放入架构或工程知识。
