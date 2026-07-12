---
id: e-rfp-to-thing-hidden
kind: association
name: RfpToLaptopThing
label: 需求标的
source: rfp-laptop
target: thing-laptop
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: RFP 的需求标的，视图默认选中时展开。
---

# 需求标的

RFP 的需求标的，视图默认选中时展开。

| 源           | 目标           | 类型          |
| ------------ | -------------- | ------------- |
| `rfp-laptop` | `thing-laptop` | `participant` |
