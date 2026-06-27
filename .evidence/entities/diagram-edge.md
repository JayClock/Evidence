---
id: diagram_edge
name: DiagramEdge
label: 图边
type: PARTICIPANT
subType: Thing
---

# DiagramEdge｜图边

> DiagramEdge 是图上的视觉连线。它连接两个图节点，并可引用一个 LogicalRelationship。

## 基本信息

| 项目     | 值                    |
| -------- | --------------------- |
| 模型类型 | Entity                |
| 主标识   | `id`                  |
| 所属聚合 | [Diagram](diagram.md) |

## 属性

| 属性                  | 类型                        | 必填 | 说明           |
| --------------------- | --------------------------- | ---- | -------------- |
| `id`                  | `string`                    | 是   | 边 ID          |
| `diagram`             | `Ref<Diagram>`              | 是   | 所属图         |
| `source`              | `Ref<DiagramNode>`          | 是   | 源节点         |
| `target`              | `Ref<DiagramNode>`          | 是   | 目标节点       |
| `logicalRelationship` | `Ref<LogicalRelationship>?` | 否   | 绑定的逻辑关系 |
| `sourceHandle`        | `string?`                   | 否   | 源 Handle      |
| `targetHandle`        | `string?`                   | 否   | 目标 Handle    |
| `kind`                | `string?`                   | 否   | 边类型         |
| `style`               | `object`                    | 是   | 样式配置       |
| `data`                | `object`                    | 是   | 扩展数据       |
| `animated`            | `boolean`                   | 是   | 是否动画       |
| `hidden`              | `boolean`                   | 是   | 是否隐藏       |
| `markerStart`         | `object?`                   | 否   | 起点标记       |
| `markerEnd`           | `object?`                   | 否   | 终点标记       |
| `pathOptions`         | `object`                    | 是   | 路径选项       |
| `interactionWidth`    | `number?`                   | 否   | 交互宽度       |
| `createdAt`           | `datetime`                  | 是   | 创建时间       |
| `updatedAt`           | `datetime`                  | 是   | 更新时间       |

## 关联

| 关系     | 目标                                           | 说明                 |
| -------- | ---------------------------------------------- | -------------------- |
| 属于     | [Diagram](diagram.md)                          | 边属于某个图         |
| 源节点   | [DiagramNode](diagram-node.md)                 | `source` 引用        |
| 目标节点 | [DiagramNode](diagram-node.md)                 | `target` 引用        |
| 展示     | [LogicalRelationship](logical-relationship.md) | 可视边可展示逻辑关系 |

## 设计说明

图边是视觉层对象，逻辑关系是领域层对象。两者通过 `logicalRelationship` 连接，但不应互相替代。
