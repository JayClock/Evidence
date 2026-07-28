# Evidence 上下文映射

## 产品上下文

| 上游                 | 下游                | 关系与集成                                            |
| -------------------- | ------------------- | ----------------------------------------------------- |
| Identity & Workspace | Work Intake         | Workspace membership 隔离 Inbox Item 与 Revision      |
| Identity & Workspace | Model Authoring     | Workspace 提供成员和模型所有权边界                    |
| Identity & Workspace | Diagram Projection  | 每个 Workspace 提供一个当前 Diagram 投影              |
| Work Intake          | Iteration & Kickoff | 人类选择精确 Candidate 后冻结自包含 Intake            |
| Iteration & Kickoff  | Delivery Knowledge  | Kickoff confirm 创建本 Iteration 唯一 Story           |
| Model Authoring      | Diagram Projection  | DiagramNode/Edge 投影 LogicalEntity/Relationship      |
| Desktop Runtime      | Model Authoring     | 本地 Pi Agent 通过认证 REST command 更新模型          |
| Delivery Knowledge   | Desktop Runtime     | 精确 Plan/nextAction 驱动 Pair、Showcase 与 Respond   |
| Server Runtime       | Web Runtime         | REST/HAL 与 OpenAPI Published Language                |
| Desktop Runtime      | Web Runtime         | Electron Wrapper，共享 renderer 与产品语义            |
| Desktop Runtime      | Server Runtime      | HTTPS + Authorization；loopback HTTP 仅用于开发       |
| Desktop Runtime      | Local Repository    | API + Workspace 私有 binding；路径仅留在 main process |

## 实现映射

| 上下文               | Server                                             | Web                              | Desktop                               |
| -------------------- | -------------------------------------------------- | -------------------------------- | ------------------------------------- |
| Identity & Workspace | `libs/server/domain`、`persistent`、`api`          | `libs/web/web-shell`、API client | 复用 Web 与远程 API                   |
| Work Intake          | `domain/inbox`、Prisma、Inbox controllers          | `web-feature-inbox`              | 本地 Source adapter 与 Inbox Analyst  |
| Iteration & Kickoff  | `domain/iteration`、Prisma、Iteration controller   | `web-feature-delivery`           | worktree provision 与 Kickoff Analyst |
| Delivery Knowledge   | iteration/delivery Domain、Prisma、HAL controllers | `web-feature-delivery`           | Pair/Showcase/Respond controllers     |
| Model Authoring      | filesystem model adapters、domain、controllers     | logical-entities feature         | 复用 Web 与远程 API                   |
| Diagram Projection   | `WorkspaceDiagram` 与 YAML projection              | diagrams feature                 | 复用 Web 与远程 API                   |
| AI Modeling          | 仅提供模型 command/query REST API                  | diagrams AI UI                   | 嵌入式 Pi SDK + 远程模型 API          |
| Delivery Execution   | Pair/Showcase/Respond 状态与 bounded evidence      | 人工审查与产品观察 UI            | 隔离 worktree、Pi、命令与本地 diff    |
| Resource Navigation  | HAL controllers                                    | resource-browser、web-shell      | API URL、repository binding、Agent    |

## Published Language 与适配边界

- `libs/server/api/openapi.yaml` 是 Nest 拥有的唯一 OpenAPI source，并直接生成 Web client 类型。
- Web 与 Desktop renderer 都通过同一 HAL client 消费 API，不导入 Server 内部类型。
- Web 与 Desktop 消费同一个 Nest/PostgreSQL API；Desktop 不拥有第二个 Server 或数据库。
- `.evidence` YAML 是工作空间逻辑模型的持久化语言；Diagram 是其投影，不是第二份领域模型。
- Electron IPC 仅用于取得 API URL、以短期 opaque id 选择并绑定本地目录，以及控制本地 Agent；renderer 只接收项目名与 Git 摘要，不接收绝对路径；产品业务 command/query 仍走 REST。
- Server Workspace 使用私有 `modelRoot` 访问自身 `.evidence`，HAL metadata 不发布 Server 或 Desktop 绝对路径。
- Work Intake 的 Candidate 只能经显式 selection 冻结为 Iteration Intake；只有 Kickoff 人工 confirm 可以创建 Story。内部 Orchestrator 工件不能冒充这些产品记录。

## 内部研发工具边界

Evidence Orchestrator 是当前仓库开发 Evidence 的项目本地 Pi 工具，不是产品 bounded context、运行时能力或对外集成方，因此不出现在产品关系中。它可以读取产品知识和 `.evidence` 模型验证开发场景，但 dogfooding 不构成产品依赖或用户能力。

## 边界规则

- LogicalRelationship 的端点必须属于同一 Workspace。
- Pair Driver 不能自行宣告命令成功或提交代码；Showcase Reviewer 与 Respond Learner 都是独立只读 session，不能作人工决定。
- Nest 是唯一 Server runtime；Electron main/preload 不实现 Server domain。
- Hosted API 必须认证部署 principal，所有 Workspace 访问必须通过其 membership。
- 同一 Inbox source identity 幂等；同一 Item 内每个 content SHA-256 只有一个 Revision。
- Candidate 不具权威；selection 使用 Candidate hash 与事务锁，原子创建 Iteration/Frozen Intake，但不创建 Story。
- Kickoff 人工决定使用 Proposal hash 与 Iteration version；一个 Iteration 最多创建一张 Story。
- `.evidence/` 只描述 Evidence 建模平台领域，不承载 Orchestrator 交付状态；`artifacts/iterations` 是研发审计证据，不是产品数据。
