---
id: assoc_workspace_has_diagrams
kind: association
schemaVersion: 1
name: WorkspaceHasDiagrams
label: 工作空间包含图
source: workspace
target: diagram
relationshipType: has_many
direction: directed
cardinality: one-to-many
summary: Workspace 包含 Diagram 集合。
---

# Workspace → Diagram｜工作空间包含图

> 工作空间可以包含多个可视化建模图。

## 关系卡片

| 项目     | 值                                    |
| -------- | ------------------------------------- |
| 源对象   | [Workspace](../entities/workspace.md) |
| 目标对象 | [Diagram](../entities/diagram.md)     |
| 关系类型 | `has_many`                            |
| 方向     | Workspace → Diagram                   |
| 基数     | one-to-many                           |
| API 路径 | `/api/workspaces/{id}/diagrams`       |

## 业务含义

Diagram 是 Workspace 内模型的视觉表达。一个 Workspace 可以有多个 Diagram，用不同视角展示同一组逻辑实体和逻辑关系。
