---
id: workspace
name: Workspace
label: 工作空间
type: PARTICIPANT
subType: Thing
---
# Workspace｜工作空间

> Workspace 是 Evidence 的主要边界上下文，也是当前建模内容的容器。

## 基本信息

| 项目 | 值 |
| --- | --- |
| 模型类型 | Aggregate Root |
| 领域类型 | Context / Bounded Context |
| 主标识 | `id` |
| 主要职责 | 管理工作空间内的成员、图、逻辑实体、逻辑关系 |

## 属性

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | 是 | 工作空间 ID |
| `title` | `string` | 是 | 标题 |
| `description` | `string?` | 否 | 描述 |
| `status` | `string` | 是 | 工作空间状态 |
| `metadata` | `object` | 是 | 扩展元数据 |
| `createdAt` | `datetime` | 是 | 创建时间 |
| `updatedAt` | `datetime` | 是 | 更新时间 |
| `deletedAt` | `datetime?` | 否 | 软删除时间 |

## 子集合

| 集合 | 目标 | 说明 |
| --- | --- | --- |
| `members` | [Member](member.md) | 工作空间成员 |
| `diagrams` | [Diagram](diagram.md) | 可视化图 |
| `logicalEntities` | [LogicalEntity](logical-entity.md) | 逻辑实体 |
| `logicalRelationships` | [LogicalRelationship](logical-relationship.md) | 逻辑关系 |

## 业务规则

- Workspace 是建模内容的边界。
- 删除采用软删除，查询时过滤 `deletedAt`。
- 创建工作空间时会自动添加 owner 成员。
