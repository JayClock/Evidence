---
id: e-contract-to-money
kind: association
name: ContractToMoneyThing
label: 约定价款
source: contract-laptop-purchase
target: thing-payment-money
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 合同约定采购款。
---

# 约定价款

合同约定采购款。

| 源                         | 目标                  | 类型          |
| -------------------------- | --------------------- | ------------- |
| `contract-laptop-purchase` | `thing-payment-money` | `participant` |
