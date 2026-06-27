---
id: assoc_diagram_edge_references_logical_relationship
kind: association
schemaVersion: 1
name: DiagramEdgeReferencesLogicalRelationship
label: 图边引用逻辑关系
source: diagram_edge
target: logical_relationship
relationshipType: references
direction: directed
cardinality: many-to-zero-or-one
summary: DiagramEdge 可通过 logicalRelationship 引用 LogicalRelationship。
---

# DiagramEdge → LogicalRelationship｜图边引用逻辑关系

> 图边是视觉层对象，逻辑关系是领域层对象。二者通过引用连接。

## 关系卡片

| 项目     | 值                                                         |
| -------- | ---------------------------------------------------------- |
| 源对象   | [DiagramEdge](../entities/diagram-edge.md)                 |
| 目标对象 | [LogicalRelationship](../entities/logical-relationship.md) |
| 关系类型 | `references`                                               |
| 方向     | DiagramEdge → LogicalRelationship                          |
| 基数     | many-to-zero-or-one                                        |
| 字段     | `logicalRelationship`                                      |

## 业务含义

一条视觉边可以展示一条逻辑关系，也可以只是临时连线、布局辅助线或未建模的草稿连接。
