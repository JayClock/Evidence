---
id: diagram
name: Diagram
label: 图
type: PARTICIPANT
subType: Thing
---

# Diagram｜图

> Diagram 是可视化建模图的聚合。它负责组织图节点、图边和版本快照。

## 基本信息

| 项目     | 值                        |
| -------- | ------------------------- |
| 模型类型 | Aggregate                 |
| 主标识   | `id`                      |
| 所属边界 | [Workspace](workspace.md) |
| API 资源 | `diagram`                 |

## 属性

| 属性        | 类型             | 必填 | 说明                   |
| ----------- | ---------------- | ---- | ---------------------- |
| `id`        | `string`         | 是   | 图 ID                  |
| `workspace` | `Ref<Workspace>` | 是   | 所属工作空间           |
| `title`     | `string`         | 是   | 图标题                 |
| `type`      | `DiagramType`    | 是   | 图类型                 |
| `viewport`  | `Viewport`       | 是   | 当前视口状态           |
| `status`    | `DiagramStatus`  | 是   | `draft` 或 `published` |
| `createdAt` | `datetime`       | 是   | 创建时间               |
| `updatedAt` | `datetime`       | 是   | 更新时间               |

## Viewport

> Viewport 是 Diagram 的视口状态，作为 `viewport` 字段存在。

| 属性   | 类型     | 说明                 |
| ------ | -------- | -------------------- |
| `x`    | `number` | 视口横向偏移         |
| `y`    | `number` | 视口纵向偏移         |
| `zoom` | `number` | 缩放比例，默认 `1.0` |

## 图类型

| 类型          | 说明       |
| ------------- | ---------- |
| `flowchart`   | 流程图     |
| `sequence`    | 时序图     |
| `class`       | 类图       |
| `component`   | 组件图     |
| `state`       | 状态图     |
| `activity`    | 活动图     |
| `fulfillment` | 履约建模图 |

## 子集合

| 集合       | 目标                                 | 说明       |
| ---------- | ------------------------------------ | ---------- |
| `nodes`    | [DiagramNode](diagram-node.md)       | 图节点     |
| `edges`    | [DiagramEdge](diagram-edge.md)       | 图边       |
| `versions` | [DiagramVersion](diagram-version.md) | 图版本快照 |

## 行为

| 操作                                              | 说明                           |
| ------------------------------------------------- | ------------------------------ |
| `create_version()`                                | 根据当前节点、边和视口创建快照 |
| `save_diagram(diagramId, draftNodes, draftEdges)` | 保存草稿图                     |
| `publish_diagram(diagramId)`                      | 发布图                         |
