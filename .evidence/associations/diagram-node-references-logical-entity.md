---
id: assoc_diagram_node_references_logical_entity
kind: association
schemaVersion: 1
name: DiagramNodeReferencesLogicalEntity
label: 图节点引用逻辑实体
source: diagram_node
target: logical_entity
relationshipType: references
direction: directed
cardinality: many-to-zero-or-one
summary: DiagramNode 可通过 logicalEntity 引用 LogicalEntity。
---

# DiagramNode → LogicalEntity｜图节点引用逻辑实体

> 图节点是视觉层对象，逻辑实体是领域层对象。二者通过引用连接。

## 关系卡片

| 项目     | 值                                             |
| -------- | ---------------------------------------------- |
| 源对象   | [DiagramNode](../entities/diagram-node.md)     |
| 目标对象 | [LogicalEntity](../entities/logical-entity.md) |
| 关系类型 | `references`                                   |
| 方向     | DiagramNode → LogicalEntity                    |
| 基数     | many-to-zero-or-one                            |
| 字段     | `logicalEntity`                                |

## 业务含义

一个节点可以展示一个逻辑实体，也可以只是注释、分组或其他视觉元素。
