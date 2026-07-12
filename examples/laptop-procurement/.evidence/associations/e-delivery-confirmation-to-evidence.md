---
id: e-delivery-confirmation-to-evidence
kind: association
name: DeliveryConfirmationToEvidence
label: 产生发货单
source: confirmation-delivery
target: evidence-delivery-note
relationshipType: evidence
direction: directed
cardinality: many-to-many
summary: 发货确认产生发货单。
---

# 产生发货单

发货确认产生发货单。

| 源                      | 目标                     | 类型       |
| ----------------------- | ------------------------ | ---------- |
| `confirmation-delivery` | `evidence-delivery-note` | `evidence` |
