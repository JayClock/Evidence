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

## 边界规则

- Diagram 图元素是逻辑模型的投影，不是第二份领域模型。
- Rust 与 Nest 可实现相同 REST/domain 语义，但一个场景必须选择唯一 owning server runtime。
- OpenAPI 是服务端与 Web API client 的 Published Language。
- `.evidence/` 描述 Evidence 产品领域；`artifacts/iterations` 只保存场景展开和模型增量证据。
