---
id: logical_relationship
name: LogicalRelationship
label: 逻辑关系
type: PARTICIPANT
subType: Thing
---

# LogicalRelationship｜逻辑关系

> LogicalRelationship 是逻辑实体之间的关联对象。修改实体之间的关系时，应修改关系对象，而不是把关系写入两个实体文件。

## 基本信息

| 项目     | 值                        |
| -------- | ------------------------- |
| 模型类型 | Association Object        |
| 主标识   | `id`                      |
| 所属边界 | [Workspace](workspace.md) |
| API 资源 | `logical-relationship`    |

## 属性

| 属性        | 类型                 | 必填 | 说明         |
| ----------- | -------------------- | ---- | ------------ |
| `id`        | `string`             | 是   | 关系 ID      |
| `workspace` | `Ref<Workspace>`     | 是   | 所属工作空间 |
| `source`    | `Ref<LogicalEntity>` | 是   | 源实体       |
| `target`    | `Ref<LogicalEntity>` | 是   | 目标实体     |
| `label`     | `string?`            | 否   | 关系标签     |

## 行为

| 操作                           | 说明             |
| ------------------------------ | ---------------- |
| `add(desc)`                    | 创建逻辑关系     |
| `update(relationshipId, desc)` | 更新逻辑关系     |
| `delete(relationshipId)`       | 删除逻辑关系     |
| `list(page, pageSize)`         | 分页查询逻辑关系 |

## 设计说明

当前代码中的关系模型较轻量。若按本地优先 Markdown 继续演进，建议扩展这些字段：

| 字段                        | 用途                                    |
| --------------------------- | --------------------------------------- |
| `relationshipType`          | 关系语义，如 `belongs_to`、`depends_on` |
| `sourceRole` / `targetRole` | 两端角色名                              |
| `cardinality`               | 基数约束                                |
| `direction`                 | 方向，单向或双向                        |
| `status`                    | 草稿、已发布等生命周期                  |

## 关联

| 关系       | 目标                               | 说明                         |
| ---------- | ---------------------------------- | ---------------------------- |
| 属于       | [Workspace](workspace.md)          | 每条逻辑关系属于一个工作空间 |
| 源实体     | [LogicalEntity](logical-entity.md) | `source` 引用                |
| 目标实体   | [LogicalEntity](logical-entity.md) | `target` 引用                |
| 被图边展示 | [DiagramEdge](diagram-edge.md)     | 图边可引用逻辑关系           |
