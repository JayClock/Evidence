---
id: assoc_workspace_has_logical_relationships
kind: association
schemaVersion: 1
name: WorkspaceHasLogicalRelationships
label: 工作空间包含逻辑关系
source: workspace
target: logical_relationship
relationshipType: has_many
direction: directed
cardinality: one-to-many
summary: Workspace 是 LogicalRelationship 的归属边界。
---

# Workspace → LogicalRelationship｜工作空间包含逻辑关系

> 逻辑关系与逻辑实体一样，都归属于某个工作空间。

## 关系卡片

| 项目     | 值                                                         |
| -------- | ---------------------------------------------------------- |
| 源对象   | [Workspace](../entities/workspace.md)                      |
| 目标对象 | [LogicalRelationship](../entities/logical-relationship.md) |
| 关系类型 | `has_many`                                                 |
| 方向     | Workspace → LogicalRelationship                            |
| 基数     | one-to-many                                                |
| API 路径 | `/api/workspaces/{id}/logical-relationships`               |

## 业务含义

关系不内嵌在实体文件中，而是作为独立对象由 Workspace 管理。
