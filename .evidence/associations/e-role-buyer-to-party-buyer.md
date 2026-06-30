---
id: e-role-buyer-to-party-buyer
kind: association
name: BuyerRoleToBuyerParty
label: 由当事人扮演
source: role-buyer
target: party-buyer-company
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 星河零售扮演采购方角色。
---

# 由当事人扮演

星河零售扮演采购方角色。

| 源           | 目标                  | 类型          |
| ------------ | --------------------- | ------------- |
| `role-buyer` | `party-buyer-company` | `participant` |
