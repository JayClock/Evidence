---
id: e-contract-to-role-receiver
kind: association
name: ContractToReceiverRole
label: 约定角色
source: contract-laptop-purchase
target: role-receiver
relationshipType: role
direction: directed
cardinality: many-to-many
summary: 合同约定收货方角色。
---

# 约定角色

合同约定收货方角色。

| 源                         | 目标            | 类型   |
| -------------------------- | --------------- | ------ |
| `contract-laptop-purchase` | `role-receiver` | `role` |
