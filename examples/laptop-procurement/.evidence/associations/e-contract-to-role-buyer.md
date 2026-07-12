---
id: e-contract-to-role-buyer
kind: association
name: ContractToBuyerRole
label: 约定角色
source: contract-laptop-purchase
target: role-buyer
relationshipType: role
direction: directed
cardinality: many-to-many
summary: 合同约定采购方角色。
---

# 约定角色

合同约定采购方角色。

| 源                         | 目标         | 类型   |
| -------------------------- | ------------ | ------ |
| `contract-laptop-purchase` | `role-buyer` | `role` |
