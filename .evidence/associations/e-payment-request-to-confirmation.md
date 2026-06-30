---
id: e-payment-request-to-confirmation
kind: association
name: PaymentRequestToConfirmation
label: 支付完成
source: request-payment
target: confirmation-payment
relationshipType: fulfillment
direction: directed
cardinality: many-to-many
summary: 支付请求被确认完成。
---

# 支付完成

支付请求被确认完成。

| 源                | 目标                   | 类型          |
| ----------------- | ---------------------- | ------------- |
| `request-payment` | `confirmation-payment` | `fulfillment` |
