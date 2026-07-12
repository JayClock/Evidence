---
id: e-delivery-confirmation-to-thing
kind: association
name: DeliveryConfirmationToThing
label: 确认交付标的
source: confirmation-delivery
target: thing-laptop
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 发货确认确认办公笔记本已交付物流。
---

# 确认交付标的

发货确认确认办公笔记本已交付物流。

| 源                      | 目标           | 类型          |
| ----------------------- | -------------- | ------------- |
| `confirmation-delivery` | `thing-laptop` | `participant` |
