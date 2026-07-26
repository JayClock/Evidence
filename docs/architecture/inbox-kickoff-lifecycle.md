# Inbox → Kickoff 权威生命周期

- **Decision ID**：EVD-002
- **状态**：Accepted
- **决定日期**：2026-07-21

## 决定

Evidence 产品采用与项目本地 Evidence Orchestrator 一致的 Inbox 与 Kickoff 语义，但通过产品自身的 Domain、PostgreSQL、REST/HAL 和 Desktop Pi SDK 实现，不导入 `.pi/` Runtime 代码或工件。

```text
Capture / Sync Source
  → 人类选择 1–5 个 active Inbox Item
  → Inbox Analyst 引用精确 latest Revision 提出 Candidate
  → 人类选择一张 ready Candidate
  → 创建 Iteration 并冻结 Intake
  → Desktop provision 隔离 worktree
  → Kickoff 人工决定
  → confirm 后才创建 Story 并进入 Understand/TQA
```

## 权威边界

- Inbox 是 Source identity、不可变 Revision、Extraction 和非权威 Candidate 的唯一权威。
- Candidate 必须引用精确 Inbox Revision SHA-256，不拥有 Story ID，也不能被 Agent 选择。
- Candidate selection 只 claim Candidate、占用 WIP、创建 Iteration 和 Frozen Intake，不创建 Story。
- Frozen Intake 必须复制自包含的 Candidate 与 Source Revision 快照；live Inbox 的后续变化不能改写它。
- Kickoff Proposal 没有 Story 权威。只有人类 `confirm` 才能创建本 Iteration 唯一的 Story。
- `revise` 记录理由并让 Requirements Analyst 仅基于 Frozen Intake 与决定历史提出替代 Proposal。
- `split`、`defer` 和 `stop` 终止当前 Iteration，不自动创建其他 Story 或 Candidate。
- 一轮 Iteration 最多创建一张 `US-001`；baseline Revision 不含 Scenario，后续反馈重入时保留 Story identity 并追加不可变修订。

## Candidate 状态

```text
ready ──source revised──> stale
ready ──human select────> selected
ready|stale ──defer─────> deferred
ready|stale ──reject────> rejected
```

状态由不可变 Candidate、live latest Revision、append-only Decision 和唯一 Iteration claim 共同投影。选中后的 Frozen Intake 不再读取 live Inbox。

## Kickoff 决定

| 决定      | 结果                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| `confirm` | 创建 Problem Statement、Lean Story Card、每轮唯一 `US-001` 和不可编码 baseline Revision，进入 `understand/tqa` |
| `revise`  | 记录必填理由，清除 current Proposal，进入 `candidate_drafting`                                                 |
| `split`   | 终止当前 Iteration；人类回 Inbox 重新提取                                                                      |
| `defer`   | 终止并保留完整审计证据                                                                                         |
| `stop`    | 终止并保留完整审计证据                                                                                         |

Lean Story Card 只包含 title、role、goal、value 和 Problem Statement link。Scenario、TQA 对话、决定和执行元数据必须保存在独立资源中。

## Runtime 边界

- Server/PostgreSQL 保存全部权威状态、快照、哈希和人类决定。
- Desktop 执行本地 Markdown/GitHub adapter、受限 Pi Analyst 和 worktree provisioning。
- Agent capability 只能调用绑定到一个 Extraction 或 Iteration 的单次提案命令，不能调用人工决定。
- Web 通过 REST/HAL 执行业务 command/query；Electron IPC 只暴露本地 source、Agent 和 repository 的最小能力。
- Server 不接收本地绝对路径、Pi 凭据、源码、完整 diff、stdout、Prompt 或推理。

## 迁移

现有 Candidate `confirm → Story` 模型、`pending/confirmed/rejected` 状态和旧 API 不再兼容。迁移可以清除已有 Inbox、Story 与 CodingRun 工作流数据；不得通过 backfill 将旧确认记录冒充为 Iteration/Kickoff 证据。
