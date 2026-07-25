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
2. 用户捕获手工文本，或 provider 以稳定 source kind/external key 同步来源。
3. 重复请求返回同一 Inbox Item；只有不同内容哈希形成新的不可变 Revision。
4. 用户浏览来源正文、URI、provider metadata、更新时间和完整 Revision 分页历史。
5. 用户把条目标记为 active、deferred 或 closed，并通过乐观版本避免覆盖并发决定。
6. 后续建模或 Delivery 决定引用精确 Revision，而不是可变的外部来源。

## 旅程 E：确认交付 Story

1. 交付确认者从 Inbox 当前 Revision 提出包含角色、问题、目标、价值和认知模式的 Story Candidate。
2. Candidate 保存精确 Inbox Item、Revision、SHA-256 和 locator，但保持非权威状态。
3. 用户在 Story Candidates 页面核对陈述和来源，可明确拒绝并保留决定。
4. 用户明确确认 pending Candidate 时，Server 原子创建 Story 与不可变 Story Revision v1，并记录确认者。
5. 确认请求重试返回同一个 Revision；已拒绝 Candidate 不能再确认，已确认 Candidate 不能再拒绝。
6. 用户可浏览 Story、最新 Revision 和完整 Revision 历史；后续 CodingRun 只能锁定具体 Revision。

## 旅程 F：细化场景并审查本地 CodingRun

1. 用户基于 latest Story Revision 确认至少一个有序 Given/When/Then Scenario，形成新的不可变 Revision。
2. 用户为该 latest Revision 创建 CodingRun；同一 Revision 同时不能有另一个活动 Run。
3. Desktop 使用 API + Workspace 对应的本地 Git repository binding 创建独立 branch/worktree，主工作树保持不变。
4. 本地 Pi Agent 只使用 worktree 内受限文件工具和固定质量门；Controller 计算 diff hash 并把 Run 推进到待审查。
5. 用户在共享 Web UI 中检查 Server 保存的有限执行事实和 Desktop 提供的本地完整 diff。
6. 接受时 Desktop 先校验 diff hash，再创建一个本地 Conventional Commit 并通知 Server；不自动 merge/push。
7. 拒绝、取消或失败会记录决定并清理本地 worktree/branch，不提交代码。
