---
id: e-contract-to-role-supplier
kind: association
name: ContractToSupplierRole
label: 约定角色
source: contract-laptop-purchase
target: role-supplier
relationshipType: role
direction: directed
cardinality: many-to-many
summary: 合同约定供应方角色。
---

# 约定角色

合同约定供应方角色。

| 源                         | 目标            | 类型   |
| -------------------------- | --------------- | ------ |
| `contract-laptop-purchase` | `role-supplier` | `role` |
