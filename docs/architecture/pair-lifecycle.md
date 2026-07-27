# Approved Tasking Plan 与 Pair 权威生命周期

- **Decision ID**：EVD-005
- **状态**：Accepted
- **决定日期**：2026-08-02

## 决定

Evidence 产品以人工 Desk Check 批准的精确 Tasking Plan 作为 Pair 的唯一入口。Server 保存计划、流程 checkpoint、有限执行事实、异常、Manifest 与人工决定；Desktop 在既有 Iteration worktree 内运行短生命周期 Pi Driver、独立 Red Reviewer 和锁定命令。

```text
tasking/approved
  → pair/plan_confirmed
  → Test Driver writes one TEST
  → Controller observes locked Red command
  → independent Red Reviewer accepts behavior failure
  → Production Driver writes the minimum implementation
  → Controller observes locked Green command
  → repeat each TEST in approved TASK/process-step order
  → one Refactor or explicit no-op per process step
  → all approved quality gates
  → pair/quality_gates_passed
  → human reviews the complete local Story diff and bounded evidence
  → Desktop verifies the diff and creates one local commit
  → pair/approved
```

Pair 在 `pair/approved` 停止。Showcase、Respond、merge 和 push 不属于本决定。

## 权威与执行边界

- Server 从不可变 Approved Tasking Plan 确定唯一 `nextAction`。Desktop 执行动作，但不得复制或自行推进业务状态机。
- Pair 锁定 Iteration、Story、Story Revision、No Model Impact Decision、Approved Tasking Plan、Git baseline、Nx project catalog、v3 process definitions、focused commands、quality gates 和有限执行预算。
- Test、Production 和 Refactor Driver 是独立的短生命周期 Pi session。Driver 没有命令、Server mutation、commit、merge 或 push 工具。
- Test Driver 只能修改当前 process step 的测试根；Production Driver 不能修改测试；Refactor 只能在当前 step 已确认的生产范围内修改，或明确返回 no-op。
- Controller 不使用 shell，只能执行 Approved Plan 已物化并通过严格语法验证的命令。
- Red Reviewer 使用独立 session，且没有文件或命令工具。只有达到业务断言的失败可被接受为 Red；编译、依赖、配置、网络、fixture、timeout、spawn 或 signal 失败都是 pseudo-Red。
- 每个 TEST 必须形成 accepted Red 与 Green；每个 process step 只接受一次 Refactor checkpoint；最终质量门全部通过后才出现 Story 级编码审批。

## 执行证据

Server 只保存 bounded、append-only 事实：

- Driver role、TASK/TEST/process/step、相对 changed paths、before/after worktree hash 和 diff hash；
- 精确 approved command、termination、exit code、stdout/stderr hash、字节数和行数；
- Red 分类、failure fingerprint、重试与预算消耗；
- 最终 Manifest hash、diff hash、commit SHA 和人工决定。

stdout/stderr 正文、源码、完整 diff、绝对路径、Pi Prompt、消息、Session、推理与凭据只留在 Desktop。Server 不运行 Pi。

## 异常与人工路由

- 相同 failure fingerprint 的重试、无进展 checkpoint、Agent call、命令 timeout 和总活动时间均受 Approved Plan 中的有限预算约束；预算不能自动扩大。跨越边界的 Driver、命令、Red Review 或 automation trigger 必须先持久化，再转换为 `budget_exhausted`，不得以 conflict 丢弃触发证据。
- Desktop 中断、lease 过期、Unexpected Green、路径越界、Git HEAD 改变、Nx owner 漂移或 evidence hash 不一致必须 fail closed。
- Server 根据失败动作和当前 checkpoint 只提供允许的 `back_test`、`back_implementation`、`back_tasking`、`retry_quality` 或 `cancel` 路由；每个人工路由都要求理由。瞬时 Driver、命令或 Red Reviewer 故障只能恢复对应未完成动作，不能跳过 Red、Green、Refactor 或质量门。
- 继续 Pair 时，Server 在 `nextAction` 中锁定 `repair_test`、`repair_implementation`、`repair_refactor` 或 `repair_quality_gate`。命令失败只引用精确 observation；完整 diff 审查退回只引用该 append-only 人工决定及其 bounded reason。Desktop 只把匹配引用的本地 bounded diagnostics 交给 Driver。
- 返回 Tasking 时旧 Plan、PairRun 和执行事实保持不可变；后续 Plan 必须重新 Desk Check，并由新的 PairRun 精确引用。

## 编码审批

- 完整 diff 由 Desktop 本地提供给共享 Web renderer；Browser-only 模式只能查看 Server evidence，不能完成审批。
- 人工接受前，Desktop 必须重新计算 diff hash，并与 Server Manifest 锁定值一致。每次退回修复都会清除当前 Manifest authority；后续质量门生成新的不可变 Manifest revision，旧 revision 不覆盖、不删除。
- Desktop 创建一个本地 Conventional Commit 后，Web 通过 REST/HAL 提交 `manifestSha256 + diffSha256 + commitSha + reason` 的人工决定。
- 决定失败可按同一 hash/commit 幂等重试；不得自动 merge 或 push，Iteration worktree 为后续 Showcase 保留。

## Breaking cutover

不提供旧 Coding 流程兼容：

- 不恢复 CodingRun Domain、Prisma 表、Story admission、REST route 或 HAL relation；
- 不读取旧 Approved Tasking Plan payload，也不 backfill、双读或双写；
- 删除一次性全 Story Coding Agent、旧 gate runner、旧 IPC 和 package runtime；
- Pair 的唯一入口是 `tasking/approved` 的 v2 Approved Tasking Plan。
