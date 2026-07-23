# Work Intake 与 Delivery 产品边界

- **Decision ID**：EVD-001
- **状态**：Accepted
- **决定日期**：2026-07-22

## 决定

Evidence 产品增加两个彼此衔接、但不等同于内部研发编排器的上下文：

1. **Work Intake**：在 Workspace 内保存来源身份、Inbox Item、不可变 Revision、状态和内容 SHA-256。
2. **Delivery Knowledge**：保存经人工确认的 Story Candidate、不可变 Story Revision、Scenario、CodingRun 及人工接受或拒绝决定。

Server 是两个上下文的权威知识来源。Desktop 是本地执行边界：它以 `API base URL + workspaceId` 绑定本地 repository，在隔离 worktree 中运行 Pi 和测试。Server 不接收或公开 Desktop 绝对路径、Pi 凭据、完整源码、完整 diff 或 stdout。

## 与内部 Evidence Orchestrator 的关系

`.pi/extensions/evidence-orchestrator/`、`engineering/evidence-orchestrator/` 和 `artifacts/iterations/` 仍是开发本仓库的内部工具。产品 Work Intake/Delivery：

- 不导入现有 Inbox 或 Iteration 工件；
- 不依赖内部 extension、agent、skill、prompt 或状态仓库；
- 不复用内部 `US-xxx`、Iteration loop 或审批状态作为产品模型；
- 只通过新建的产品 Domain、PostgreSQL persistence 和 REST/HAL contract 演进。

Dogfooding 只允许内部工具读取产品知识来辅助开发，不允许产品 Runtime 反向读取内部工件。

## 权威数据与本地数据

| 边界                  | 保存内容                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Server/PostgreSQL     | Inbox source identity、不可变 Revision、Story/Scenario、CodingRun 状态、摘要、哈希和人工决定 |
| Server filesystem     | Server 自有的 `.evidence` 模型目录；私有 `modelRoot` 不进入 HAL metadata                     |
| Desktop binding store | 规范化的本地 repositoryRoot，以 API + Workspace 为键                                         |
| Desktop worktree      | 临时代码、diff、测试 stdout 和 Pi session；未经人工接受不得 merge/push                       |

## 当前落地状态

- Work Intake 的 Inbox、Revision、状态、HAL/OpenAPI、Web 页面和 PostgreSQL migration 已落地。
- Desktop repository binding 已落地，但 coding worktree 与 coding agent 尚未落地。
- Story Candidate、人工确认/拒绝、Story 与不可变 Story Revision v1 已通过 Domain、PostgreSQL、REST/HAL、Web 和黑盒契约落地。
- 后续 Story Revision、Scenario 和 CodingRun 尚未落地；当前 v1 只冻结 Story 陈述与精确 Inbox 引用。
- Server 端 ModelingProposal Pi 路径仍存在，待 Desktop Coding 通过后单独退休。

## 后果

- 新 Delivery 行为必须先进入 `libs/server/domain`，再由 Prisma adapter 和 API 暴露。
- Story Candidate 没有人类权威；确认命令按 optimistic version 原子、幂等地创建 `Story + Story Revision v1`，拒绝不能创建 Story。
- Story Revision 不可改写，并保存 Candidate 内容哈希、确认者和精确 Inbox Revision 引用。
- CodingRun 必须锁定精确 Story Revision；Pi 不能自行宣告运行成功。
- 每次本地 coding run 使用独立 branch/worktree；只有人工接受后才能 commit，不自动 merge/push。
- Workspace access 先经过当前部署 principal 的 membership；Hosted API 必须配置 Authorization。
