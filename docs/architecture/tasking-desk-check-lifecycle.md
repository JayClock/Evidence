# No Model Impact 与 Tasking / Desk Check 权威生命周期

- **Decision ID**：EVD-004
- **状态**：Accepted
- **决定日期**：2026-08-01

## 决定

Evidence 产品本轮不实现完整 Modeling Profile、模型展开或独立模型挑战。已确认 Scenario Set 只能经一条显式、人工拥有的 `tool/none/false` 处置进入 Tasking；该处置是可审计的无模型影响证据，不能被 Agent 推断或代行。

```text
understand/modeling
  → human confirms no_model_required (tool / none / false)
  → tasking/drafting
  → local Tasking Analyst proposes one complete Tasking Candidate
  → tasking/desk_check
  → human Desk Check
      ├─ approve → tasking/approved（Pair 的 plan-confirmed 入口）
      ├─ revise → tasking/drafting
      ├─ architecture_gap | process_gap → tasking/knowledge_gap
      └─ scenario_gap → understand/tqa
```

本决定只交付无模型影响处置、Tasking Candidate 和 Desk Check，到 `tasking/approved` 停止。逐 TEST Red/Green、Refactor、最终质量门、编码审批、Showcase 和 Respond 由后续决定交付。

## 无模型影响权威

- 决定锁定当前 Iteration、`US-001`、精确 latest Story Revision、完整 Scenario Set 及内容 SHA-256。
- 固定语义为 `subject=tool`、`method=none`、`modelChangeRequired=false`；人工必须填写非空理由。
- 决定不可改写，并由决定者、时间和 canonical content SHA-256 标识。
- Tasking 中所有 TEST/TASK 的 `modelRefs` 必须为空；不得把未完成的模型分析伪装成模型事实。
- business/domain Story 或模型影响不确定时不得使用该路径；本轮产品没有其他 Modeling 出口。

## Tasking Candidate

一个 Candidate 必须锁定：

- 精确 Story Revision、全部 confirmed `SC-xxx`、无模型影响决定和 Git baseline；
- 每个 Scenario/Then 的独立 Q2 acceptance intent；
- 去重的 Q1 support tests，且每个 Q1 至少支撑一个 Q2；
- runtime、functional context、technical boundary 和唯一 v3 test process；
- 每个 TypeScript TEST 的 owning Nx project、safe test filter 和 materialized focused command；
- planned/test project 的固定质量门；
- dependency-ordered TASK，每个 TEST 恰好属于一个 TASK；
- bounded Nx project catalog hash、process definition hash 和完整 Candidate hash。

Server 发布并验证产品自有的 v3 process catalog。Desktop 只上传相对 Nx project identity、target 和 hash，不上传 repositoryRoot、源码或命令输出。Tasking Analyst 每轮只能提交一个完整 Candidate，不能执行 Desk Check。

## Desk Check

- `approve` 必须重新验证 Candidate、Story/Scenario、No Model Impact、Git baseline、process/catalog/command hash 和 Iteration optimistic version。
- `approve` 创建不可变 Approved Plan，并把 Iteration 停在 `tasking/approved`；它不启动 CodingRun。
- `revise`、`architecture_gap`、`process_gap` 和 `scenario_gap` 必须记录理由。
- `scenario_gap` 返回 `understand/tqa`，旧 Proposal、Decision 和 Plan 证据保持不可变。
- 只有人工能提交 Desk Check 决定。

## Breaking cutover

不提供旧流程兼容：

- 删除 Story → CodingRun 的直接 admission、HAL relation、REST/OpenAPI contract 和 Web/Desktop 启动入口；
- 删除旧 CodingRun 权威表和运行记录，不 backfill、不双读；
- 保留 Desktop worktree、受限 coding tools 和 diff/gate 低层实现，后续由批准 Plan 的 Pair Controller 重新接入；
- 不接受“Scenario 存在即可编码”或隐式 Modeling bypass。

## Runtime 边界

- Server/PostgreSQL 保存 No Model Impact、Tasking Proposal、Desk Check Decision、Approved Plan、哈希和人工 actor。
- Desktop 在 Iteration worktree 内解析 bounded Nx project catalog，并运行只拥有 `propose_tasking` custom tool 的本地 Pi Agent。
- Browser 不运行 Tasking Agent，也不回退到 Server Pi。
- Server 不接收本地绝对路径、源码、diff、stdout、Pi Session、Prompt、消息、推理或凭据。
