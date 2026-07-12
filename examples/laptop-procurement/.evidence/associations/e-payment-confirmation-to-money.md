---
id: e-payment-confirmation-to-money
kind: association
name: PaymentConfirmationToMoney
label: 确认支付价款
source: confirmation-payment
target: thing-payment-money
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 支付确认确认采购款已支付。
---

# 确认支付价款

支付确认确认采购款已支付。

| 源                     | 目标                  | 类型          |
| ---------------------- | --------------------- | ------------- |
| `confirmation-payment` | `thing-payment-money` | `participant` |
