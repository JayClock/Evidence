---
id: e-payment-confirmation-to-evidence
kind: association
name: PaymentConfirmationToEvidence
label: 产生凭证
source: confirmation-payment
target: evidence-payment-voucher
relationshipType: evidence
direction: directed
cardinality: many-to-many
summary: 支付确认产生支付凭证。
---

# 产生凭证

支付确认产生支付凭证。

| 源                     | 目标                       | 类型       |
| ---------------------- | -------------------------- | ---------- |
| `confirmation-payment` | `evidence-payment-voucher` | `evidence` |
