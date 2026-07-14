# Evidence 上下文映射

## 产品上下文

| 上游                 | 下游               | 关系与集成                                       |
| -------------------- | ------------------ | ------------------------------------------------ |
| Identity & Workspace | Model Authoring    | Workspace 提供成员与模型所有权边界               |
| Identity & Workspace | Diagram Projection | Diagram 属于 Workspace                           |
| Model Authoring      | Diagram Projection | DiagramNode/Edge 引用 LogicalEntity/Relationship |
| AI Modeling          | Model Authoring    | Agent 提出 ModelingProposal，用户确认后应用      |
| Web Runtime          | REST API           | HTTP JSON 与 OpenAPI Published Language          |
| Desktop Runtime      | Web Runtime        | Tauri Wrapper，共享前端与领域语义                |

## 实现映射

| 上下文               | Rust 轨道                                             | Nest 轨道                                      | Web                              |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| Identity & Workspace | `libs/server/domain`、`persistent`、`api`             | `libs/server-nest/domain`、`persistent`、`api` | `libs/web/web-shell`、API client |
| Model Authoring      | LogicalEntity/LogicalRelationship domain 与 API       | 对应 Nest domain/API                           | logical-entities feature         |
| Diagram Projection   | Diagram/Node/Edge domain 与 API                       | 对应 Nest domain/API                           | diagrams feature                 |
| AI Modeling          | `libs/server/infrastructure` 与 domain architect port | 按场景明确                                     | diagrams AI UI                   |
| Resource Navigation  | HAL API                                               | REST controller                                | resource-browser、web-shell      |

## 内部研发工具边界

Evidence Orchestrator 是当前仓库开发 Evidence 的项目本地 Pi 工具，不是产品 bounded context、运行时能力或对外集成方，因此不出现在上面的产品关系与实现映射中。它可以读取产品知识和 `.evidence` 模型来验证开发场景，但这种 dogfooding 不构成产品依赖或用户能力。

## 边界规则

- Diagram 图元素是逻辑模型的投影，不是第二份领域模型。
- Rust 与 Nest 可实现相同 REST/domain 语义，但一个场景必须选择唯一 owning server runtime。
- OpenAPI 是服务端与 Web API client 的 Published Language。
- `.evidence/` 只描述 Evidence 建模平台领域，不承载 Orchestrator 的内部交付状态或流程语义；`artifacts/iterations` 是研发审计证据，不是产品数据。
