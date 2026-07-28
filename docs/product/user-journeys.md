# Evidence 核心用户旅程

本文件只维护 Evidence 建模平台用户跨 Feature 的稳定核心旅程。仓库开发、测试与发布流程属于内部工程旅程，不进入这里。

## 旅程 A：建立业务模型

1. 用户进入或创建工作区。
2. 用户邀请成员或确认协作边界。
3. 用户定义 Evidence、Participant、Role、Context 等逻辑实体。
4. 用户定义逻辑关系及其方向和含义。
5. 用户创建 Diagram，把逻辑实体投影为节点并展示关系。
6. 团队浏览、讨论并修正模型。
7. 经确认的模型变化被持久化并保留可追踪关系。

## 旅程 B：在 Desktop 借助 AI 改进模型

1. 用户在 Desktop 的具体工作区和图上下文中描述建模意图。
2. 本地 Agent 通过受限工具和认证 REST API 读取当前模型与上下文。
3. Agent 仅按用户当前请求执行模型 command，并流式解释活动和结果。
4. 用户检查修改后的实体、关系及其影响，结果重新投影到图。
5. Browser 没有本地 Agent 时禁用 AI 输入，不回退到 Server Pi endpoint；普通模型 CRUD 仍走同一 Server API。

## 旅程 C：跨 Web/Desktop 使用

1. Web 用户通过浏览器访问共享前端和 Hosted API。
2. Desktop 用户通过 Electron renderer 使用同一前端。
3. Electron 连接经过健康检查的 Server API；非 loopback endpoint 使用 HTTPS 和配置的 Authorization。
4. 两者消费一致的 REST/HAL 与权威 PostgreSQL 数据。
5. Desktop 用户选择本地 repository 时，main process 验证路径并向 renderer 只返回项目名、Git HEAD 摘要和一次性 opaque selection id；绝对路径仅写入以 API + Workspace 为键的 Desktop binding store。
6. Desktop 特有能力通过受限 preload bridge 提供，不复制业务页面或业务 API。

## 旅程 D：整理可追溯来源

1. 交付输入整理者进入自己具有 membership 的 Workspace Inbox。
2. 用户捕获手工文本；Desktop 也可从 bound repository 的相对 Markdown 路径或本地 `gh` 读取 provider-neutral 快照，绝对路径和凭据不上传 Server。
3. 重复请求返回同一 Inbox Item；只有不同内容哈希形成新的不可变 Revision。
4. 用户浏览来源正文、URI、provider metadata、更新时间和完整 Revision 分页历史。
5. 用户把条目标记为 active、deferred 或 closed，并通过乐观版本避免覆盖并发决定。
6. 后续建模或 Delivery 决定引用精确 Revision，而不是可变的外部来源。

## 旅程 E：从 Inbox 冻结一轮 Kickoff Story

1. 交付确认者明确选择 1–5 个 active Inbox Item；Server 原子冻结各 Item 的 exact latest Revision 为 Extraction。
2. Desktop Inbox Analyst 只能读取该 Extraction，并一次性提出 1–5 张包含角色、问题、目标、价值、认知模式和精确 citation 的 Candidate；Candidate 没有 Story ID。
3. live Inbox 后续更新使未选择的 ready Candidate 投影为 stale，但不能改写 Extraction 或后续 Frozen Intake。
4. 用户核对 Candidate，可填写理由执行不可撤销 defer/reject；选择一张 ready Candidate 时 Server claim WIP、分配 `ITER-xxxx`、复制自包含 Frozen Intake，但不创建 Story。
5. Desktop 从当前 Git HEAD 创建 `evidence/iter-*` branch 与隔离 worktree，只向 Server 回报 base SHA、branch name 和 bounded failure summary；失败不自动释放 Candidate。
6. 用户在 Kickoff 核对 Frozen Proposal。`revise` 先记录人工理由，再由本地 Kickoff Analyst 只基于 Frozen Intake 与决定历史提出替代 Proposal。
7. `split/defer/stop` 终止当前 Iteration 且不创建 Story；Agent 没有任何人工决定工具。
8. 只有用户 `confirm` 当前 Proposal 时，Server 才原子创建该 Iteration 唯一 `US-001`、Problem Statement、Lean Story Card 和不可编码 baseline Revision，并进入 `understand/tqa`。
9. 用户可浏览 Frozen Intake、append-only 决定、Story、最新 Revision 和完整 Revision 历史；至少一个 Scenario 进入 latest Revision 前不提供 Tasking admission。

## 旅程 F：通过 TQA 确认 Story 场景

1. Kickoff confirm 后，用户进入同一 `US-001` 的 Understand/TQA；本地 Requirements Analyst 每轮只能提出一个业务问题，或提出完整的 1–5 个 Scenario Draft。
2. 问题必须面向业务，并路由为 `business_context`、`story` 或 `history`；用户的原文回答先成为 Server 权威记录，Agent 不能代答。
3. `business_context` 与 `history` 回答继续同一 TQA；`story` 回答返回 Kickoff，由 replacement Proposal 修正同一 Story identity，而不是创建第二张 Story。
4. 当知识充分时，Agent 提出包含具体 Given、一个 When、可观察 Then 与 business data 的完整 Scenario Set。
5. 用户可 confirm、continue、split 或 defer；省略 Draft 时必须说明理由，所有决定 append-only。
6. confirm 原子创建连续 `SC-xxx` 与新的不可变 Story Revision，并进入 `understand/modeling/profile`。
7. Browser 不运行 Pi；Desktop 的持久 TQA session 只是本地缓存，Server Clarification、Proposal 和 Decision 始终是事实源。

## 旅程 G：通过 Pair 执行并审查 Story 代码

1. 人工 Desk Check 批准锁定精确 Story Revision、TEST/TASK、v3 process、focused commands、质量门和有限预算；Scenario confirm 本身不提供直接 Coding admission。
2. Desktop 复用 API + Workspace 对应的 Iteration 隔离 branch/worktree，主工作树保持不变；Server 从 Approved Plan 发布唯一下一动作。
3. 短生命周期 Test Driver 只写当前 TEST，Controller 执行锁定 Red 命令，独立 Red Reviewer 只接受达到业务断言的行为失败。
4. Production Driver 写最小实现，Controller 观察 Green；当前 process step 全部 Green 后执行一次 Refactor 或显式 no-op，再运行最终质量门。
5. 用户在共享 Web UI 中检查 Server 保存的有限执行事实和 Desktop 提供的本地完整 Story diff。
6. 接受时 Desktop 先校验 Manifest/diff hash，再创建一个本地 Conventional Commit；Web 通过 REST/HAL 记录人工决定，不自动 merge/push。
7. pseudo-Red、越界、重复失败、预算耗尽或中断会 fail closed；人工只能按当前 checkpoint 提供的路由返回 Test、Implementation、Tasking、重试质量门或取消。

## 旅程 H：观察产品价值并确认本轮学习

1. 人工编码批准后，Server 原子创建锁定 Story Revision、Approved Plan、Pair Manifest 与 approved commit 的 Showcase Attempt；旧 Pair 证据保持不变。
2. Desktop 在干净的 approved commit 上重新执行 Plan 中全部 Q2，并只向 Server 回传 termination、hash 与大小等 bounded facts；Pair 质量门结果不能复用。
3. 领域专家逐个 Scenario 观察实际产品行为，记录与每个 Then 对应的结果、价值反馈和 evidence refs；测试或 AI 不能代替该观察。
4. 用户分别决定 Q3/Q4 是否需要活动；required 的每项活动记录 passed/concern，not_required 记录理由。失败或 concern 禁止 Accept。
5. Desktop 启动独立只读 Showcase Reviewer；Reviewer 只能给出结构化建议。用户再以理由 Accept、按知识缺口 Revise 或 Reject。
6. Accept 后 Desktop 启动只读 Respond Learner，基于 accepted Showcase 提出一份 knowledge response、残余风险与一个 next Probe；空 promotions 合法但必须说明理由。
7. 用户审查精确 Respond Candidate，可 Revise 并保留旧 Candidate，或 Approve 完成本轮。next Probe 不自动写入 Inbox，也不自动创建下一张 Story。
