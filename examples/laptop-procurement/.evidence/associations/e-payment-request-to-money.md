---
id: e-payment-request-to-money
kind: association
name: PaymentRequestToMoney
label: 请求支付价款
source: request-payment
target: thing-payment-money
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 支付申请请求支付采购款。
---

# 请求支付价款

支付申请请求支付采购款。

| 源                | 目标                  | 类型          |
| ----------------- | --------------------- | ------------- |
| `request-payment` | `thing-payment-money` | `participant` |
