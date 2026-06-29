---
id: assoc_diagram_node_references_parent_node
kind: association
schemaVersion: 1
name: DiagramNodeReferencesParentNode
label: 图节点引用父节点
source: diagram_node
target: diagram_node
relationshipType: references
direction: directed
cardinality: many-to-zero-or-one
summary: DiagramNode 可通过 parent 引用父 DiagramNode。
---

# DiagramNode → DiagramNode｜图节点引用父节点

> 节点可以有父节点，用于表达分组、容器和层级结构。

## 关系卡片

| 项目     | 值                                         |
| -------- | ------------------------------------------ |
| 源对象   | [DiagramNode](../entities/diagram-node.md) |
| 目标对象 | [DiagramNode](../entities/diagram-node.md) |
| 关系类型 | `references`                               |
| 方向     | child → parent                             |
| 基数     | many-to-zero-or-one                        |
| 字段     | `parent`                                   |

## 业务含义

这是一条自关联。多个子节点可以属于同一个父节点，但一个子节点最多只有一个父节点。
