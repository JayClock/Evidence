# Evidence 上下文映射

## 产品上下文

| 上游                 | 下游                | 关系与集成                                            |
| -------------------- | ------------------- | ----------------------------------------------------- |
| Identity & Workspace | Work Intake         | Workspace membership 隔离 Inbox Item 与 Revision      |
| Identity & Workspace | Model Authoring     | Workspace 提供成员和模型所有权边界                    |
| Work Intake          | Iteration & Kickoff | 人类选择精确 Candidate 后冻结自包含 Intake            |
| Iteration & Kickoff  | Delivery Knowledge  | Kickoff confirm 创建本 Iteration 唯一 Story           |
| Model Authoring      | Diagram Projection  | Diagram 投影 LogicalEntity/Relationship               |
| Delivery Knowledge   | Desktop Runtime     | 精确 Plan/nextAction 驱动 Pair、Showcase 与 Respond   |
| Server Runtime       | Web Runtime         | REST/HAL 与 OpenAPI Published Language                |
| Desktop Runtime      | Server Runtime      | HTTPS + Authorization；loopback HTTP 仅用于开发       |
| Desktop Runtime      | Local Repository    | API + Workspace 私有 binding；路径仅留在 main process |

## 实现映射

| 上下文               | Java Server                                     | Web                      | Desktop                               |
| -------------------- | ----------------------------------------------- | ------------------------ | ------------------------------------- |
| Identity & Workspace | domain/application/MyBatis/JAX-RS               | web-shell、API client    | 复用 Web 与远程 API                   |
| Work Intake          | Inbox domain、MyBatis、JAX-RS resources         | web-feature-inbox        | Source adapter 与 Inbox Analyst       |
| Iteration & Kickoff  | Iteration domain/application/persistence        | web-feature-delivery     | worktree provision 与 Kickoff Analyst |
| Delivery Knowledge   | Tasking/Pair/Showcase/Respond application flows | web-feature-delivery     | 本地 Delivery Loop controllers        |
| Model Authoring      | filesystem adapters、domain、JAX-RS resources   | logical-entities feature | 复用 Web 与远程 API                   |
| Diagram Projection   | WorkspaceDiagram 与 YAML projection             | diagrams feature         | 复用 Web 与远程 API                   |
| AI Modeling          | 仅提供模型 command/query REST API               | diagrams AI UI           | 嵌入式 Pi SDK + 远程模型 API          |
| Resource Navigation  | HAL representation assemblers                   | resource-browser         | API URL、repository binding、Agent    |

## Published Language 与适配边界

- `libs/contracts/evidence.openapi` 是唯一 OpenAPI source，并生成 Web client 类型。
- Web 与 Desktop renderer 通过同一 HAL client 消费 API，不导入 Server 内部类型。
- `.evidence` YAML 是工作空间逻辑模型的持久化语言；Diagram 是其投影，不是第二份可变模型。
- Electron IPC 只提供 API URL、目录 binding 与本地 Agent 能力；业务 command/query 仍走 REST。
- Server Workspace 使用私有 `modelRoot`，HAL metadata 不发布 Server 或 Desktop 绝对路径。
- Candidate selection 只创建 Iteration/Frozen Intake；只有人工 Kickoff confirm 可以创建 Story。

## 边界规则

- Java 是唯一 Server runtime；Electron main/preload 不实现 Server domain。
- LogicalRelationship 的端点必须属于同一 Workspace。
- Hosted API 必须验证 OIDC principal，并按 Workspace membership role 授权。
- 同一 Inbox source identity 幂等；同一 Item 内每个 content SHA-256 只有一个 Revision。
- Pair Driver 不能自行提交代码；Showcase Reviewer 与 Respond Learner 不能作人工决定。
