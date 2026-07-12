---
id: e-payment-evidence-to-bank
kind: association
name: PaymentEvidenceToBank
label: 来源系统
source: evidence-payment-voucher
target: third-bank-system
relationshipType: external_reference
direction: directed
cardinality: many-to-many
summary: 支付凭证来源于企业网银。
---

# 来源系统

支付凭证来源于企业网银。

| 源                         | 目标                | 类型                 |
| -------------------------- | ------------------- | -------------------- |
| `evidence-payment-voucher` | `third-bank-system` | `external_reference` |
