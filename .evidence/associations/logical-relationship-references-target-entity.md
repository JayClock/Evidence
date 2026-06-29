---
id: assoc_logical_relationship_references_target_entity
kind: association
schemaVersion: 1
name: LogicalRelationshipReferencesTargetEntity
label: 逻辑关系引用目标实体
source: logical_relationship
target: logical_entity
relationshipType: references
direction: directed
cardinality: many-to-one
summary: LogicalRelationship 通过 target 引用目标 LogicalEntity。
---

# LogicalRelationship → LogicalEntity｜引用目标实体

> 每条逻辑关系都有一个目标实体，表示关系指向哪里。

## 关系卡片

| 项目     | 值                                                         |
| -------- | ---------------------------------------------------------- |
| 源对象   | [LogicalRelationship](../entities/logical-relationship.md) |
| 目标对象 | [LogicalEntity](../entities/logical-entity.md)             |
| 关系类型 | `references`                                               |
| 方向     | LogicalRelationship → LogicalEntity                        |
| 基数     | many-to-one                                                |
| 字段     | `target`                                                   |

## 示例

```txt
Order --references--> Customer
```

在这个例子中，`Customer` 是 target。
