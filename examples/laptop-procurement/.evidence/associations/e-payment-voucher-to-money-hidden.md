---
id: e-payment-voucher-to-money-hidden
kind: association
name: PaymentVoucherToMoney
label: 证明价款
source: evidence-payment-voucher
target: thing-payment-money
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 支付凭证证明价款，视图默认选中时展开。
---

# 证明价款

支付凭证证明价款，视图默认选中时展开。

| 源                         | 目标                  | 类型          |
| -------------------------- | --------------------- | ------------- |
| `evidence-payment-voucher` | `thing-payment-money` | `participant` |
