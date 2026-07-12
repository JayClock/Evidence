# 实体和值对象

本文定义 Evidence 当前领域模型中的实体、值对象和引用对象，并说明它们的身份、属性、生命周期和约束。

## 实体总览

| 实体          | 身份                             | 所属上下文           | 生命周期拥有者           | 说明                     |
| ------------- | -------------------------------- | -------------------- | ------------------------ | ------------------------ |
| User          | user_id                          | Identity & Workspace | 系统/用户目录            | Evidence 使用者。        |
| Workspace     | workspace_id                     | Identity & Workspace | UserWorkspaces           | 建模协作容器。           |
| Member        | member_id 或 user/workspace 组合 | Identity & Workspace | WorkspaceMembers         | 用户与工作区的成员关系。 |
| LogicalEntity | logical_entity_id                | Modeling Core        | WorkspaceLogicalEntities | 被建模的业务概念。       |
| Diagram       | diagram_id                       | Diagramming          | WorkspaceDiagrams        | 图模型容器。             |
| DiagramNode   | node_id                          | Diagramming          | DiagramNodes             | 图中的节点。             |
| DiagramEdge   | edge_id                          | Diagramming          | DiagramEdges             | 图中的边。               |

## User

### 身份

- `UserIdentity`
- 当前默认种子身份：`desktop-user`

### 描述

用户是进入 Evidence 的主体，可拥有多个工作区，也可以作为成员加入工作区。

### 关键属性

| 属性        | 类型            | 说明           |
| ----------- | --------------- | -------------- |
| id          | UserIdentity    | 用户唯一身份。 |
| description | UserDescription | 用户描述信息。 |

### 约束

- 用户身份应稳定，不应依赖展示名。
- 默认用户必须能找到默认工作区。

## Workspace

### 身份

- `WorkspaceIdentity`

### 描述

工作区是 Evidence 的协作和模型隔离边界，包含成员、图和逻辑实体。

### 关键属性

| 属性        | 类型                 | 说明                         |
| ----------- | -------------------- | ---------------------------- |
| id          | WorkspaceIdentity    | 工作区唯一身份。             |
| description | WorkspaceDescription | 工作区名称、说明等描述信息。 |

### 约束

- 工作区创建时必须创建 owner 成员关系。
- Diagram 和 LogicalEntity 必须属于某个 Workspace。
- 删除工作区应考虑成员、图和逻辑实体的级联或软删除策略。

## Member

### 身份

- `MemberIdentity`，或在持久化层通过 workspace/user 唯一约束表达。

### 描述

成员表达用户在工作区中的参与关系和权限角色。

### 关键属性

| 属性      | 类型           | 说明                  |
| --------- | -------------- | --------------------- |
| id        | MemberIdentity | 成员关系身份。        |
| user      | Ref<User>      | 成员引用的用户。      |
| workspace | Ref<Workspace> | 成员所属工作区。      |
| role      | MemberRole     | owner/member 等角色。 |

### 约束

- 同一用户不能重复加入同一工作区。
- owner 角色用于表示工作区创建者或所有者。

## LogicalEntity

### 身份

- `LogicalEntityIdentity`

### 描述

逻辑实体是 Evidence 的核心建模对象，用于表达证据、参与者、角色或上下文。

### 关键属性

| 属性       | 类型                  | 说明                                   |
| ---------- | --------------------- | -------------------------------------- |
| id         | LogicalEntityIdentity | 逻辑实体身份。                         |
| workspace  | Ref<Workspace>        | 所属工作区。                           |
| type       | LogicalEntityType     | Evidence、Participant、Role、Context。 |
| sub_type   | LogicalEntitySubType  | 与 type 兼容的子类型。                 |
| definition | Text                  | 人类可读定义。                         |
| attributes | Attribute[]           | 结构化属性。                           |
| behaviors  | Behavior[]            | 行为或能力描述。                       |
| tags       | Tag[]                 | 分类标签。                             |

### 约束

- type 必须是受控枚举。
- sub_type 必须属于 type 允许范围。
- definition 应避免为空，以保证模型可理解。
- 逻辑实体可独立于图存在。

## Diagram

### 身份

- `DiagramIdentity`

### 描述

图用于组织节点和边，可视化表达逻辑实体关系。

### 关键属性

| 属性        | 类型               | 说明             |
| ----------- | ------------------ | ---------------- |
| id          | DiagramIdentity    | 图身份。         |
| workspace   | Ref<Workspace>     | 所属工作区。     |
| description | DiagramDescription | 图名称、说明等。 |

### 约束

- 图必须属于工作区。
- 图详情可嵌入 nodes 和 edges 以支持前端渲染。

## DiagramNode

### 身份

- `DiagramNodeIdentity`

### 描述

图节点是 Diagram 内的可视元素，可引用 LogicalEntity。

### 关键属性

| 属性           | 类型                | 说明                                 |
| -------------- | ------------------- | ------------------------------------ |
| id             | DiagramNodeIdentity | 节点身份。                           |
| diagram        | Ref<Diagram>        | 所属图。                             |
| logical_entity | Ref<LogicalEntity>  | 可选或必需引用，取决于节点类型规则。 |
| node_type      | NodeType            | 节点类型。                           |
| position       | Position            | x/y 坐标。                           |
| style          | NodeStyle           | 前端呈现样式。                       |

### 约束

- 节点必须属于图。
- 引用逻辑实体时，该实体必须属于同一工作区。
- 节点位置属于图呈现，不应污染 LogicalEntity。

## DiagramEdge

### 身份

- `DiagramEdgeIdentity`

### 描述

图边连接两个 DiagramNode，用于表达关系类型和说明。

### 关键属性

| 属性          | 类型                | 说明               |
| ------------- | ------------------- | ------------------ |
| id            | DiagramEdgeIdentity | 边身份。           |
| diagram       | Ref<Diagram>        | 所属图。           |
| source        | Ref<DiagramNode>    | 起点节点。         |
| target        | Ref<DiagramNode>    | 终点节点。         |
| relation_type | RelationType        | 关系类型。         |
| label         | Label               | 人类可读关系说明。 |

### 约束

- source 和 target 必须存在。
- source 和 target 必须属于同一 Diagram。
- 不应允许悬空边。

## 值对象

| 值对象                | 用途         | 约束                         |
| --------------------- | ------------ | ---------------------------- |
| UserIdentity          | 用户身份     | 稳定、唯一、可序列化。       |
| WorkspaceIdentity     | 工作区身份   | 稳定、唯一、可用于 URL。     |
| LogicalEntityIdentity | 逻辑实体身份 | 稳定、唯一。                 |
| DiagramIdentity       | 图身份       | 稳定、唯一。                 |
| DiagramNodeIdentity   | 节点身份     | 图内/全局唯一，取决于实现。  |
| DiagramEdgeIdentity   | 边身份       | 图内/全局唯一，取决于实现。  |
| Description           | 资源描述     | 应包含人类可读名称和说明。   |
| Ref<T>                | 跨实体引用   | 表达引用，不暴露持久化实现。 |
| Position              | 节点位置     | 至少包含 x/y；属于图呈现。   |
| NodeStyle             | 节点样式     | 不应承载业务规则。           |
| RelationType          | 边关系类型   | 应逐步收敛为受控词汇。       |
| Label                 | 展示标签     | 面向人类阅读。               |
| Attribute             | 逻辑实体属性 | key/value 或结构化定义。     |
| Behavior              | 逻辑实体行为 | 描述业务能力或动作。         |
| Tag                   | 分类标签     | 简短、可检索。               |
| PageRequest           | 分页请求     | page/pageSize。              |
| PageMetadata          | 分页元数据   | total、page、pageSize 等。   |

## 建模约束

- Entity trait 统一暴露 `identity()` 和 `description()`。
- HasMany trait 统一表达子集合访问。
- Ref<T> 用于保持跨实体关系的类型安全。
- Domain 层不依赖 API、SeaORM、Axum、Tauri 或 React。
- 持久化对象和 API DTO 不应直接替代领域实体。
