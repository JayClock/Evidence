---
id: assoc_diagram_has_nodes
kind: association
schemaVersion: 1
name: DiagramHasNodes
label: 图包含节点
source: diagram
target: diagram_node
relationshipType: has_many
direction: directed
cardinality: one-to-many
summary: Diagram 包含 DiagramNode 集合。
---

# Diagram → DiagramNode｜图包含节点

> 一个图由多个节点组成。节点是图上的主要视觉元素。

## 关系卡片

| 项目     | 值                                         |
| -------- | ------------------------------------------ |
| 源对象   | [Diagram](../entities/diagram.md)          |
| 目标对象 | [DiagramNode](../entities/diagram-node.md) |
| 关系类型 | `has_many`                                 |
| 方向     | Diagram → DiagramNode                      |
| 基数     | one-to-many                                |
| 只读接口 | `nodes()`                                  |
| 数据来源 | `.evidence/entities/*.md`                  |

## 业务含义

节点属于图，由 `.evidence/entities/*.md` 中的实体模型投影生成；图节点接口只负责读取。
