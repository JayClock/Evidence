---
id: diagram_node
name: DiagramNode
label: 图节点
type: PARTICIPANT
subType: Thing
---

# DiagramNode｜图节点

> DiagramNode 是图上的一个可视节点。它可以独立存在，也可以绑定到一个 LogicalEntity。

## 基本信息

| 项目     | 值                    |
| -------- | --------------------- |
| 模型类型 | Entity                |
| 主标识   | `id`                  |
| 所属聚合 | [Diagram](diagram.md) |

## 属性

| 属性            | 类型                  | 必填 | 说明                   |
| --------------- | --------------------- | ---- | ---------------------- |
| `id`            | `string`              | 是   | 节点 ID                |
| `diagram`       | `Ref<Diagram>`        | 是   | 所属图                 |
| `kind`          | `string`              | 是   | 节点类型               |
| `logicalEntity` | `Ref<LogicalEntity>?` | 否   | 绑定的逻辑实体         |
| `parent`        | `Ref<DiagramNode>?`   | 否   | 父节点，用于分组和层级 |
| `position`      | `Position`            | 是   | 节点位置               |
| `width`         | `number?`             | 否   | 宽度                   |
| `height`        | `number?`             | 否   | 高度                   |
| `data`          | `object`              | 是   | 节点扩展数据           |
| `createdAt`     | `datetime`            | 是   | 创建时间               |
| `updatedAt`     | `datetime`            | 是   | 更新时间               |

## Position

> Position 是 DiagramNode 的位置值对象，作为 `position` 字段存在。

| 属性 | 类型     | 说明   |
| ---- | -------- | ------ |
| `x`  | `number` | 横坐标 |
| `y`  | `number` | 纵坐标 |

## 关联

| 关系   | 目标                               | 说明                   |
| ------ | ---------------------------------- | ---------------------- |
| 属于   | [Diagram](diagram.md)              | 节点属于某个图         |
| 展示   | [LogicalEntity](logical-entity.md) | 可视节点可展示逻辑实体 |
| 父节点 | [DiagramNode](diagram-node.md)     | 节点可被另一个节点包含 |
