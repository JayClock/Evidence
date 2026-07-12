---
id: e-contract-to-thing-laptop
kind: association
name: ContractToLaptopThing
label: 约定标的
source: contract-laptop-purchase
target: thing-laptop
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 合同约定办公笔记本标的。
---

# 约定标的

合同约定办公笔记本标的。

| 源                         | 目标           | 类型          |
| -------------------------- | -------------- | ------------- |
| `contract-laptop-purchase` | `thing-laptop` | `participant` |
