---
id: assoc_diagram_has_versions
kind: association
schemaVersion: 1
name: DiagramHasVersions
label: 图包含版本快照
source: diagram
target: diagram_version
relationshipType: has_many
direction: directed
cardinality: one-to-many
summary: Diagram 包含 DiagramVersion 集合。
---

# Diagram → DiagramVersion｜图包含版本快照

> 图可以创建多个版本快照，用于发布、审计和回溯。

## 关系卡片

| 项目     | 值                                               |
| -------- | ------------------------------------------------ |
| 源对象   | [Diagram](../entities/diagram.md)                |
| 目标对象 | [DiagramVersion](../entities/diagram-version.md) |
| 关系类型 | `has_many`                                       |
| 方向     | Diagram → DiagramVersion                         |
| 基数     | one-to-many                                      |
| 创建方式 | `create_version()`                               |

## 业务含义

创建版本时，系统会把当前 nodes、edges 和 viewport 写入 DiagramVersion 的 snapshot。
