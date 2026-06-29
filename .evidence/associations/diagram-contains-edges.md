---
id: assoc_diagram_contains_edges
kind: association
schemaVersion: 1
name: DiagramContainsEdges
label: 图包含边
source: diagram
target: diagram_edge
relationshipType: contains
direction: directed
cardinality: one-to-many
summary: Diagram 包含 DiagramEdge 集合。
---

# Diagram → DiagramEdge｜图包含边

> 一个图由多条边连接节点。边是图上的视觉连线。

## 关系卡片

| 项目     | 值                                         |
| -------- | ------------------------------------------ |
| 源对象   | [Diagram](../entities/diagram.md)          |
| 目标对象 | [DiagramEdge](../entities/diagram-edge.md) |
| 关系类型 | `contains`                                 |
| 方向     | Diagram → DiagramEdge                      |
| 基数     | one-to-many                                |
| 只读接口 | `edges()`                                  |
| 数据来源 | `.evidence/associations/*.md`              |

## 业务含义

边属于图，由 `.evidence/associations/*.md` 中的关联对象投影生成；图边接口只负责读取。
