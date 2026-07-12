---
id: e-delivery-request-to-confirmation
kind: association
name: DeliveryRequestToConfirmation
label: 发货完成
source: request-delivery
target: confirmation-delivery
relationshipType: fulfillment
direction: directed
cardinality: many-to-many
summary: 发货申请被确认完成。
---

# 发货完成

发货申请被确认完成。

| 源                 | 目标                    | 类型          |
| ------------------ | ----------------------- | ------------- |
| `request-delivery` | `confirmation-delivery` | `fulfillment` |
