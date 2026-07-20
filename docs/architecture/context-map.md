# Evidence 上下文映射

## 产品上下文

| 上游                 | 下游               | 关系与集成                                        |
| -------------------- | ------------------ | ------------------------------------------------- |
| Identity & Workspace | Model Authoring    | Workspace 提供成员、repository 和模型所有权边界   |
| Identity & Workspace | Diagram Projection | 每个 Workspace 提供一个当前 Diagram 投影          |
| Model Authoring      | Diagram Projection | DiagramNode/Edge 投影 LogicalEntity/Relationship  |
| AI Modeling          | Model Authoring    | Agent 流式提出 ModelingProposal，用户确认后才应用 |
| Server Runtime       | Web Runtime        | REST/HAL 与 OpenAPI Published Language            |
| Desktop Runtime      | Web Runtime        | Electron Wrapper，共享 renderer 与产品语义        |
| Desktop Runtime      | Server Runtime     | 管理本地 Nest child，或显式连接远程 HTTPS API     |

## 实现映射

| 上下文               | Server                                         | Web                              | Desktop                       |
| -------------------- | ---------------------------------------------- | -------------------------------- | ----------------------------- |
| Identity & Workspace | `libs/server/domain`、`persistent`、`api`      | `libs/web/web-shell`、API client | SQLite registry、本地目录选择 |
| Model Authoring      | filesystem model adapters、domain、controllers | logical-entities feature         | 复用 Web 与本地 Nest          |
| Diagram Projection   | `WorkspaceDiagram` 与 YAML projection          | diagrams feature                 | 复用 Web 与本地 Nest          |
| AI Modeling          | `DomainArchitect` port、Pi SDK、SSE controller | diagrams AI UI                   | Nest child 内嵌 Pi SDK        |
| Resource Navigation  | HAL controllers                                | resource-browser、web-shell      | preload 只提供 API base URL   |

## Published Language 与适配边界

- `libs/server/api/openapi.yaml` 是 Nest 拥有的唯一 OpenAPI source，并直接生成 Web client 类型。
- Web 与 Desktop renderer 都通过同一 HAL client 消费 API，不导入 Server 内部类型。
- Hosted 与 Desktop 共享 Domain/API，只在 composition root 切换 PostgreSQL 与 SQLite registry。
- `.evidence` YAML 是工作空间逻辑模型的持久化语言；Diagram 是其投影，不是第二份领域模型。
- Electron IPC 仅用于取得 API URL 和选择本地目录，不承担业务 command/query。

## 内部研发工具边界

Evidence Orchestrator 是当前仓库开发 Evidence 的项目本地 Pi 工具，不是产品 bounded context、运行时能力或对外集成方，因此不出现在产品关系中。它可以读取产品知识和 `.evidence` 模型验证开发场景，但 dogfooding 不构成产品依赖或用户能力。

## 边界规则

- LogicalRelationship 的端点必须属于同一 Workspace。
- AI 只能提出候选，不能直接改变权威模型。
- Nest 是唯一 Server runtime；Electron main/preload 不实现 Server domain。
- `.evidence/` 只描述 Evidence 建模平台领域，不承载 Orchestrator 交付状态；`artifacts/iterations` 是研发审计证据，不是产品数据。
