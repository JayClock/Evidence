# Showcase 与 Respond 权威生命周期

- **Decision ID**：EVD-006
- **状态**：Accepted
- **决定日期**：2026-08-04

## 决定

Pair 的人工编码批准只回答“是否正确实现了已批准计划”。Server 在同一事务中保留已批准 Pair，并创建新的 Showcase Attempt；Showcase 独立回答“是否实现了正确的产品价值”。只有领域专家人工 `accept` 才进入 Respond，只有人工批准精确 Respond Candidate 才完成本轮边界。

```text
pair/approved
  → showcase/setup
  → Desktop 在 approvedCommitSha 上逐项重新执行 Approved Plan 的 Q2
  → 人工逐 Scenario 记录实际 Then、产品观察、价值反馈和 evidence refs
  → 人工分别决定 Q3 与 Q4：required activities 或 not_required reason
  → required activity 逐项记录 passed / concern 与 evidence refs
  → Desktop 启动独立、只读 Showcase Reviewer
  → 人工 Accept | Revise | Reject
      Accept → respond/drafting
      Revise → 精确知识缺口阶段，或创建新 Showcase Attempt
      Reject → showcase/rejected + halted
  → Desktop 启动只读 Respond Learner
  → Learner 提出一个 append-only Candidate：knowledge response + next Probe
  → 人工 Approve | Revise
      Approve → respond/accepted（Iteration 边界完成）
      Revise → respond/drafting，旧 Candidate 与决定保留
```

## 唯一 nextAction

Server 根据不可变事实计算唯一 HAL action。Web 和 Desktop 不复制状态机：

- Desktop 只消费 `execute_q2`、`run_reviewer`、`run_learner`；
- Browser 只消费产品观察、风险决定/评价、Showcase 人工决定和 Respond 人工决定；
- 每次 mutation 都锁定当前 version、action id 及对应 evidence/authority hash；
- action 成功后重新读取 Server，不在客户端猜测后继状态。

## Showcase Authority

每个 `ShowcaseRun` 是不可变来源绑定的 Attempt，锁定：

- Story Revision id/hash；
- Approved Tasking Plan id/hash；
- PairRun、最终 Manifest id/hash；
- `approvedCommitSha`；
- 当前 Attempt 的 Q2、产品观察、Q3/Q4、Review 与人工决定。

Q2 必须从 Approved Plan 重新物化并在 approved commit 上执行，不能复用 Pair 质量门结果。Desktop 在每条命令和只读 Agent 前后验证 HEAD、干净工作树与 worktree hash。Server 只接收 command、termination、exit code、duration、stdout/stderr hash/字节数/行数等 bounded facts；不接收源码、完整 diff、输出正文、绝对路径或 Pi session。

所有确认 Scenario 必须有当前用户的产品观察，且 observed outcomes 与 Then 一一对应。Q3/Q4 都必须显式决定；`required` 的每项活动必须有最新 `passed` 评价。Q2 failure 或 `concern` 只开放 Revise/Reject。全部就绪后才生成 evidence bundle hash，并允许独立 Review。

独立 Reviewer 使用单独 Pi session，只有受保护的 read/search/list/report 工具。它只能返回观察事实、产品/领域反馈、技术质量反馈、未决假设和 accept/revise 建议，不能运行命令、编辑、提交或作人工决定。

## Feedback routing

Revise 保存 `IterationFeedback`/ShowcaseDecision 事实并按知识缺口路由：

- problem/story → Kickoff；
- business knowledge/scenario → Understand/TQA；
- model/modeling method → Understand/Modeling；
- architecture/test strategy/test process → Tasking；
- value validation/showcase setup → 新 Showcase Attempt。

Test/Implementation/Refactor 路由在确定性恢复 approved commit、重开 Pair authority 和本地 checkpoint 的 Controller 落地前不进入 Domain、OpenAPI 或 UI。直接提交这些值返回 validation error，避免产生无法继续的 `pair/*` 状态。

## Respond Authority

Respond 锁定 accepted Showcase 的 Story Revision、Plan、Manifest、approved commit、evidence bundle、Review 和人工 accept decision，并计算一个 `authoritySha256`。只读 Learner 可检查相关 changed paths，但只能一次性提出：

- `promoted | deferred | rejected` knowledge entries；
- 或空 promotions 加非空 no-promotion reason；
- observed outcomes 与 residual risks；
- 一个具体 next Probe：learning question、why now、evidence refs、first action。

`promoted` 必须包含 repository-relative canonical target 与验证引用。Learner 没有写入、命令、批准、commit、merge、push、Inbox capture 或新 Story admission 能力。人工批准精确 Candidate/hash/authority 后，Iteration 进入 `respond/accepted`；next Probe 仍需人类在本轮边界外显式收集。

## Append-only 与 breaking cutover

旧 Pair Manifest/决定、Showcase Attempt/证据/Review/决定、Respond Candidate/决定均不覆盖或删除。value-validation revise 创建新 Attempt。没有旧 CodingRun、旧 Showcase alias、缺失事实 fallback、双读双写或 backfill；开发数据通过 migration/reset 使用新 authority。
