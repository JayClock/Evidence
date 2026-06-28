---
id: assoc_workspace_has_diagrams
kind: association
schemaVersion: 1
name: WorkspaceHasDiagram
label: 工作空间包含单一图
source: workspace
target: diagram
relationshipType: has_one
direction: directed
cardinality: one-to-one
summary: Workspace 通过 HasOne 拥有一个 Diagram。
---

# Workspace → Diagram｜工作空间包含单一图

> 工作空间通过 `HasOne<Diagram>` 拥有一个可视化建模图。

## 关系卡片

| 项目     | 值                                    |
| -------- | ------------------------------------- |
| 源对象   | [Workspace](../entities/workspace.md) |
| 目标对象 | [Diagram](../entities/diagram.md)     |
| 关系类型 | `has_one`                             |
| 方向     | Workspace → Diagram                   |
| 基数     | one-to-one                            |
| 领域接口 | `WorkspaceDiagram` / `HasOne`         |
| API 路径 | `/api/workspaces/{id}/diagram`        |

## 业务含义

Diagram 是 Workspace 内模型的视觉表达。一个 Workspace 只有一个 Diagram；运行时自动投影默认 `model` 图。
