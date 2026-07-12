---
id: e-contract-to-invoice-request
kind: association
name: ContractToInvoiceRequest
label: 约束开票履约
source: contract-laptop-purchase
target: request-invoice
relationshipType: timeline
direction: directed
cardinality: many-to-many
summary: 合同约束开票履约分支。
---

# 约束开票履约

合同约束开票履约分支。

| 源                         | 目标              | 类型       |
| -------------------------- | ----------------- | ---------- |
| `contract-laptop-purchase` | `request-invoice` | `timeline` |
