---
id: assoc_logical_relationship_source
kind: association
schemaVersion: 1
name: LogicalRelationshipSource
label: 逻辑关系的源实体
source: logical_relationship
target: logical_entity
relationshipType: references
direction: directed
cardinality: many-to-one
summary: LogicalRelationship 通过 source 引用源 LogicalEntity。
---

# LogicalRelationship → LogicalEntity｜源实体

> 每条逻辑关系都有一个源实体，表示关系从哪里出发。

## 关系卡片

| 项目     | 值                                                         |
| -------- | ---------------------------------------------------------- |
| 源对象   | [LogicalRelationship](../entities/logical-relationship.md) |
| 目标对象 | [LogicalEntity](../entities/logical-entity.md)             |
| 关系类型 | `references`                                               |
| 方向     | LogicalRelationship → LogicalEntity                        |
| 基数     | many-to-one                                                |
| 字段     | `source`                                                   |

## 示例

```txt
Order --belongs_to--> Customer
```

在这个例子中，`Order` 是 source。
