---
id: e-role-receiver-to-party-buyer
kind: association
name: ReceiverRoleToBuyerParty
label: 收货主体
source: role-receiver
target: party-buyer-company
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 星河零售也作为收货主体。
---

# 收货主体

星河零售也作为收货主体。

| 源              | 目标                  | 类型          |
| --------------- | --------------------- | ------------- |
| `role-receiver` | `party-buyer-company` | `participant` |
