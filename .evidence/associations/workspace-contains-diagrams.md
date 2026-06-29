---
id: assoc_workspace_contains_diagrams
kind: association
schemaVersion: 1
name: WorkspaceContainsDiagrams
label: 工作空间包含图
source: workspace
target: diagram
relationshipType: contains
direction: directed
cardinality: one-to-many
summary: Workspace 包含 Diagram 集合。
---

# Workspace → Diagram｜工作空间包含图

> 工作空间通过 `HasMany<Diagram>` 包含可视化建模图集合。

## 关系卡片

| 项目     | 值                                    |
| -------- | ------------------------------------- |
| 源对象   | [Workspace](../entities/workspace.md) |
| 目标对象 | [Diagram](../entities/diagram.md)     |
| 关系类型 | `contains`                            |
| 方向     | Workspace → Diagram                   |
| 基数     | one-to-many                           |
| 领域接口 | `WorkspaceDiagrams` / `HasMany`       |
| API 路径 | `/api/workspaces/{id}/diagrams`       |

## 业务含义

Diagram 是 Workspace 内模型的视觉表达。一个 Workspace 可以包含多个 Diagram；运行时可投影默认 `model` 图。
