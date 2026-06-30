---
id: e-role-supplier-to-party-supplier
kind: association
name: SupplierRoleToSupplierParty
label: 由当事人扮演
source: role-supplier
target: party-supplier-company
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 云岚科技扮演供应方角色。
---

# 由当事人扮演

云岚科技扮演供应方角色。

| 源              | 目标                     | 类型          |
| --------------- | ------------------------ | ------------- |
| `role-supplier` | `party-supplier-company` | `participant` |
