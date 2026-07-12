---
id: e-delivery-request-to-thing
kind: association
name: DeliveryRequestToThing
label: 请求交付标的
source: request-delivery
target: thing-laptop
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 发货申请请求交付办公笔记本。
---

# 请求交付标的

发货申请请求交付办公笔记本。

| 源                 | 目标           | 类型          |
| ------------------ | -------------- | ------------- |
| `request-delivery` | `thing-laptop` | `participant` |
