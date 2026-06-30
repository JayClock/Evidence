---
id: e-contract-to-delivery-request
kind: association
name: ContractToDeliveryRequest
label: 约束交付履约
source: contract-laptop-purchase
target: request-delivery
relationshipType: timeline
direction: directed
cardinality: many-to-many
summary: 合同约束交付履约分支。
---

# 约束交付履约

合同约束交付履约分支。

| 源                         | 目标               | 类型       |
| -------------------------- | ------------------ | ---------- |
| `contract-laptop-purchase` | `request-delivery` | `timeline` |
