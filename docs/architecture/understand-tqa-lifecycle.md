# Understand / TQA 权威生命周期

- **Decision ID**：EVD-003
- **状态**：Accepted
- **决定日期**：2026-07-31

## 决定

Evidence 产品采用与项目本地 Evidence Orchestrator 一致的单 Story TQA 与 Scenario Set 语义，但通过产品自身的 Domain、PostgreSQL、REST/HAL、Web 和 Desktop Pi SDK 实现，不导入 `.pi/` Runtime、Skill、Prompt、状态或工件。

```text
kickoff/confirm
  → understand/tqa
  → Agent 提出一个业务问题，或提出完整的 1–5 个 Scenario Draft
  → 人类回答问题，或审查完整 Scenario Set
  → confirm 后追加不可变 Story Revision 与 SC-xxx
  → understand/modeling/profile
```

本决定只交付 TQA 与 Scenario confirmation，到 `understand/modeling/profile` 停止；Modeling、Tasking 和 Pair 由后续决定交付。

## 状态机

```text
understand/tqa
  ├─ Agent ask one question → pending Q-xxx
  │    ├─ human answer: business_context/history → understand/tqa
  │    └─ human answer: story → kickoff/candidate_drafting
  ├─ Agent propose 1–5 Scenarios → understand/scenario_review
  │    ├─ human continue → understand/tqa
  │    ├─ human split/defer → halted
  │    └─ human confirm → Story Revision + SC-xxx
  │                         → understand/modeling/profile
  └─ human split/defer → halted
```

- 一轮只澄清 `activeStory` 指向的一张 `US-001`。
- 同时最多存在一个 pending clarification；存在 pending clarification 时不能提出 Scenario。
- Scenario Proposal 等待人工决定时不能继续提问或被 Agent 替换。
- Agent 每轮只能调用一次 `ask` 或 `propose` command，不能回答、确认、continue、split 或 defer。
- 人类 answer、confirm、continue、split 和 defer 是不可由 Agent 代行的权威决定。
- 所有 command 锁定 exact Story Revision、Iteration version，以及适用时的 Proposal SHA-256。

## Clarification 路由

| target             | 人工回答后的结果                                                                |
| ------------------ | ------------------------------------------------------------------------------- |
| `business_context` | 回答保存在本轮候选 context delta；未经 Respond 提升前不改写稳定产品或业务上下文 |
| `history`          | 回答只进入本 Story 的 append-only clarification history                         |
| `story`            | 回答进入 history，并把同一 Story identity 路由回 Kickoff replacement            |

Story-target 回答不得直接改写 Story Card。Kickoff 人工重新确认 replacement 后，保留同一个 Story UUID 和 `US-001`，追加 Problem Statement、Story Card 与无 Scenario baseline Story Revision，再返回 `understand/tqa`。

## Scenario authority

- Agent 一次提出完整、非重复的 1–5 个 Scenario Draft。
- 每个 Draft 包含 title、一个或多个 Given、恰好一个 When、一个或多个可观察 Then，以及至少一个具体 `businessData`。
- Scenario 只表达已确认的产品可见交互、外部接口和业务结果，不包含数据库、框架、组件、测试或其他内部实现选择。
- 人类可确认全部或部分 Draft；省略任何 Draft 时必须记录理由。
- `continue` 必须记录理由，保留旧 Proposal 与 Decision，并返回 TQA。
- `split` 或 `defer` 必须记录理由；若存在 pending clarification，则同一事务把它标记为 human-waived。
- confirm 原子分配连续 `SC-xxx`、记录 Understanding Decision、追加不可变 Story Revision，并进入 `understand/modeling/profile`。
- 旧 Scenario、Proposal、Clarification、Decision 和 Story Revision 永不改写。

## Runtime 与知识边界

- Server/PostgreSQL 保存 Story、Clarification、Scenario Proposal/Draft、Decision、Revision、哈希与人工 actor。
- Desktop 使用只含专用 custom tools 的本地 Pi session；不向 TQA Agent开放 read、bash、edit 或 write。
- Pi JSONL session 仅是以 API + Workspace + Iteration + Story 为键的本地缓存；每轮都从 Server 权威资源重建 context capsule，session 丢失时可安全重建。
- Web 通过 REST/HAL 提交人工答案和决定；Browser 不回退到 Server Pi。
- Server 不接收本地绝对路径、Pi 凭据、Prompt、Pi 消息、推理、源码、完整 diff 或 stdout/stderr。

## Breaking cutover

本决定不提供兼容路径：

- 删除人工直接 `POST /stories/{storyId}/revisions` 与自由编辑 Scenario UI；
- 删除“latest Revision 含 Scenario 即可直接启动 CodingRun”的 admission；
- Scenario authority 只能由 Understand human confirmation 创建；
- 迁移可以清除现有 Iteration、Kickoff、Story、Scenario 与 CodingRun workflow 数据，不 backfill、不双读、不保留旧 DTO、HAL relation 或 fallback reader；
- 已有 Prisma migration 历史不得改写。
