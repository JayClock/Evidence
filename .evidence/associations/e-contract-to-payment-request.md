---
id: e-contract-to-payment-request
kind: association
name: ContractToPaymentRequest
label: 约束支付履约
source: contract-laptop-purchase
target: request-payment
relationshipType: timeline
direction: directed
cardinality: many-to-many
summary: 合同约束支付履约分支。
---

# 约束支付履约

合同约束支付履约分支。

| 源                         | 目标              | 类型       |
| -------------------------- | ----------------- | ---------- |
| `contract-laptop-purchase` | `request-payment` | `timeline` |
