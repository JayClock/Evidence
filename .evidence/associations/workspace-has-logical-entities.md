---
id: assoc_workspace_has_logical_entities
kind: association
schemaVersion: 1
name: WorkspaceHasLogicalEntities
label: 工作空间包含逻辑实体
source: workspace
target: logical_entity
relationshipType: has_many
direction: directed
cardinality: one-to-many
summary: Workspace 是 LogicalEntity 的归属边界。
---

# Workspace → LogicalEntity｜工作空间包含逻辑实体

> 所有逻辑实体都归属于某个工作空间。

## 关系卡片

| 项目     | 值                                             |
| -------- | ---------------------------------------------- |
| 源对象   | [Workspace](../entities/workspace.md)          |
| 目标对象 | [LogicalEntity](../entities/logical-entity.md) |
| 关系类型 | `has_many`                                     |
| 方向     | Workspace → LogicalEntity                      |
| 基数     | one-to-many                                    |
| API 路径 | `/api/workspaces/{id}/logical-entities`        |

## 业务含义

Workspace 是逻辑实体的命名空间和权限边界。不同 Workspace 中可以有不同的模型。
