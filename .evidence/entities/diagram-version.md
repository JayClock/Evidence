---
id: diagram_version
name: DiagramVersion
label: 图版本
type: PARTICIPANT
subType: Thing
---

# DiagramVersion｜图版本

> DiagramVersion 保存某个时间点的图状态，用于发布、回溯和审计。

## 基本信息

| 项目     | 值                    |
| -------- | --------------------- |
| 模型类型 | Entity                |
| 主标识   | `id`                  |
| 所属聚合 | [Diagram](diagram.md) |

## 属性

| 属性        | 类型              | 必填 | 说明            |
| ----------- | ----------------- | ---- | --------------- |
| `id`        | `string`          | 是   | 版本 ID         |
| `diagram`   | `Ref<Diagram>`    | 是   | 所属图          |
| `name`      | `string`          | 是   | 版本名，如 `v1` |
| `snapshot`  | `DiagramSnapshot` | 是   | 图快照          |
| `createdAt` | `datetime`        | 是   | 创建时间        |

## DiagramSnapshot

> DiagramSnapshot 是 DiagramVersion 的内容载体，作为 `snapshot` 字段存在。

| 属性       | 类型             | 必填 | 说明         |
| ---------- | ---------------- | ---- | ------------ |
| `nodes`    | `SnapshotNode[]` | 是   | 节点快照列表 |
| `edges`    | `SnapshotEdge[]` | 是   | 边快照列表   |
| `viewport` | `Viewport`       | 是   | 视口状态     |

## 快照子结构

| 结构           | 字段                | 说明                   |
| -------------- | ------------------- | ---------------------- |
| `SnapshotNode` | `id`, `description` | 保存节点 ID 和节点描述 |
| `SnapshotEdge` | `id`, `description` | 保存边 ID 和边描述     |
