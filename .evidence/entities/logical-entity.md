---
id: logical_entity
name: LogicalEntity
label: 逻辑实体
type: PARTICIPANT
subType: Thing
---

# LogicalEntity｜逻辑实体

> 逻辑实体是 Evidence FM 的核心建模单元。它可以表示证据、参与者、角色或上下文。

## 基本信息

| 项目     | 值                        |
| -------- | ------------------------- |
| 模型类型 | Entity                    |
| 主标识   | `id`                      |
| 所属边界 | [Workspace](workspace.md) |
| API 资源 | `logical-entity`          |

## 属性

| 属性          | 类型                | 必填 | 说明                                            |
| ------------- | ------------------- | ---- | ----------------------------------------------- |
| `id`          | `string`            | 是   | 逻辑实体 ID                                     |
| `workspace`   | `Ref<Workspace>`    | 是   | 所属工作空间                                    |
| `type`        | `LogicalEntityType` | 是   | `EVIDENCE` / `PARTICIPANT` / `ROLE` / `CONTEXT` |
| `subType`     | `string?`           | 否   | 类型下的子类型                                  |
| `name`        | `string`            | 是   | 程序内部名称                                    |
| `label`       | `string?`           | 否   | 展示名称                                        |
| `description` | `string?`           | 否   | 简要说明                                        |
| `attributes`  | `EntityAttribute[]` | 否   | 属性定义列表                                    |
| `createdAt`   | `datetime`          | 是   | 创建时间                                        |
| `updatedAt`   | `datetime`          | 是   | 更新时间                                        |

## EntityAttribute

> EntityAttribute 是 LogicalEntity 的属性定义，作为 `attributes` 的元素存在。

| 属性          | 类型      | 必填 | 说明                                 |
| ------------- | --------- | ---- | ------------------------------------ |
| `id`          | `string`  | 是   | 属性 ID                              |
| `name`        | `string`  | 是   | 属性名                               |
| `label`       | `string?` | 否   | 展示名称                             |
| `type`        | `string?` | 否   | 属性类型，如 string、money、datetime |
| `description` | `string?` | 否   | 属性说明                             |

## 类型与子类型

| Type          | SubTypes                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `EVIDENCE`    | `rfp`, `proposal`, `contract`, `fulfillment_request`, `fulfillment_confirmation`, `other_evidence` |
| `PARTICIPANT` | `party`, `thing`                                                                                   |
| `ROLE`        | `party`, `domain`, `3rd system`, `context`, `evidence`                                             |
| `CONTEXT`     | `bounded_context`                                                                                  |

## 行为

| 操作                     | 说明             |
| ------------------------ | ---------------- |
| `add(desc)`              | 创建逻辑实体     |
| `update(entityId, desc)` | 更新逻辑实体     |
| `delete(entityId)`       | 删除逻辑实体     |
| `list(page, pageSize)`   | 分页查询逻辑实体 |

## 业务规则

- `type` 必须是四种固定类型之一。
- `subType` 必须与 `type` 匹配。
- API 输出中 `subType` 使用 `TYPE:sub_type` 形式。
- 持久化层使用软删除过滤。

## 关联

| 关系         | 目标                                           | 说明                         |
| ------------ | ---------------------------------------------- | ---------------------------- |
| 属于         | [Workspace](workspace.md)                      | 每个逻辑实体属于一个工作空间 |
| 作为源实体   | [LogicalRelationship](logical-relationship.md) | 可被关系的 `source` 引用     |
| 作为目标实体 | [LogicalRelationship](logical-relationship.md) | 可被关系的 `target` 引用     |
| 被图节点展示 | [DiagramNode](diagram-node.md)                 | 图节点可引用逻辑实体         |
