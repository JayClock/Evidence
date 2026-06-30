---
id: e-proposal-to-thing-hidden
kind: association
name: ProposalToLaptopThing
label: 报价标的
source: proposal-laptop
target: thing-laptop
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: Proposal 的报价标的，视图默认选中时展开。
---

# 报价标的

Proposal 的报价标的，视图默认选中时展开。

| 源                | 目标           | 类型          |
| ----------------- | -------------- | ------------- |
| `proposal-laptop` | `thing-laptop` | `participant` |
