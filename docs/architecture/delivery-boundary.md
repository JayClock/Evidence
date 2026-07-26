# Work Intake 与 Delivery 产品边界

- **Decision ID**：EVD-001
- **状态**：Accepted
- **决定日期**：2026-07-22

## 决定

Evidence 产品增加三个彼此衔接、但不依赖内部研发编排器 Runtime 的上下文：

1. **Work Intake**：在 Workspace 内保存来源身份、Inbox Item、不可变 Revision、显式 Extraction 和非权威 Story Candidate。
2. **Iteration & Kickoff**：人类选择精确 Candidate 后冻结 Intake、占用 WIP，并通过 Kickoff 决定创建本 Iteration 唯一的 Story。
3. **Delivery Knowledge**：保存 Story 的不可变修订、Scenario、CodingRun 及人工接受或拒绝决定。

完整权威生命周期由 [Inbox → Kickoff 权威生命周期](./inbox-kickoff-lifecycle.md) 定义。

Server 是两个上下文的权威知识来源。Desktop 是本地执行边界：它以 `API base URL + workspaceId` 绑定本地 repository，在隔离 worktree 中运行 Pi 和测试。Desktop main process 通过系统选择器接收并验证绝对路径；renderer 只取得短期、不透明、绑定到 IPC sender 的 selection id，以及项目名和 Git HEAD 摘要。Renderer 与 Server 都不接收 Desktop 绝对路径；Server 也不接收 Pi 凭据、完整源码、完整 diff 或 stdout。

## 与内部 Evidence Orchestrator 的关系

`.pi/extensions/evidence-orchestrator/`、`engineering/evidence-orchestrator/` 和 `artifacts/iterations/` 仍是开发本仓库的内部工具。产品 Work Intake/Delivery：

- 不导入现有 Inbox 或 Iteration 工件；
- 不依赖内部 extension、agent、skill、prompt 或状态仓库；
- 复用经过确认的 Inbox、Iteration、Kickoff 与 `US-xxx` **语义**，但不复用内部文件格式、代码、状态仓库或审批工件；
- 只通过产品 Domain、PostgreSQL persistence 和 REST/HAL contract 独立实现这些语义。

Dogfooding 只允许内部工具读取产品知识来辅助开发，不允许产品 Runtime 反向读取内部工件。

## 权威数据与本地数据

| 边界                  | 保存内容                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Server/PostgreSQL     | Inbox/Extraction/Candidate、Iteration/Frozen Intake/Kickoff、Story/Scenario、CodingRun 状态、哈希和人工决定 |
| Server filesystem     | Server 自有的 `.evidence` 模型目录；私有 `modelRoot` 不进入 HAL metadata                                    |
| Desktop binding store | 规范化的本地 repositoryRoot，以 API + Workspace 为键；仅 main process 访问                                  |
| Desktop worktree      | 临时代码、diff、测试 stdout 和 Pi session；未经人工接受不得 merge/push                                      |

## 当前落地状态

- Work Intake 的 provider-neutral source adapter、Inbox/Revision、1–5 项 Extraction、一次性 Inbox Analyst、Candidate 状态/决定、HAL/OpenAPI、Web 页面和 PostgreSQL migration 已落地。
- Candidate selection 原子 claim WIP 并创建 Iteration/Frozen Intake；Desktop 从当前 HEAD provision `evidence/iter-*` 隔离 worktree，只回报 bounded facts。
- Kickoff Frozen Proposal review、append-only 人工 confirm/revise/split/defer/stop、本地 replacement Analyst 和每轮唯一 `US-001` 已落地；Agent 不持有人工决定能力。
- 旧 direct Candidate confirm API、领域 port、Prisma 表/列与客户端 contract 已删除；destructive migration 不 backfill 旧 Inbox/Story/CodingRun workflow 数据。
- Understand 后可基于 baseline Story Revision 确认有序 Given/When/Then Scenario Set；至少一个 Scenario 进入前不暴露 CodingRun admission。
- CodingRun Domain、PostgreSQL、REST/HAL、OpenAPI、Web 审查 UI 与 Desktop controller 已落地；Server 端 Pi runtime 和建模 proposal endpoint 已退休。

## 后果

- 新 Delivery 行为必须先进入 `libs/server/domain`，再由 Prisma adapter 和 API 暴露。
- Story Candidate 没有人类权威；Candidate selection 只能原子创建 Iteration 与 Frozen Intake，不能创建 Story。
- Kickoff confirm 按 Proposal hash 与 Iteration version 原子创建 Story；revise/split/defer/stop 不能创建 Story。
- Story、Problem Statement、Story Card 和后续 Scenario 修订不可改写；并发决定只能有一个改变当前 Iteration 状态。
- CodingRun 必须锁定至少含一个 Scenario 的精确 Story Revision；Pi 不能自行宣告运行成功。
- 每次本地 coding run 使用独立 branch/worktree；只有人工接受后才能 commit，不自动 merge/push。
- Repository selection id 必须短期、一次性并绑定 IPC sender；只有 Desktop main process 可以把它解析为绝对路径并写入 binding store。
- Workspace access 先经过当前部署 principal 的 membership；Hosted API 必须配置 Authorization。
