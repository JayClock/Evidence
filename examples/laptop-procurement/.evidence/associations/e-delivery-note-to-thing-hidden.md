---
id: e-delivery-note-to-thing-hidden
kind: association
name: DeliveryNoteToThing
label: 证明货物
source: evidence-delivery-note
target: thing-laptop
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 发货单证明货物，视图默认选中时展开。
---

# 证明货物

发货单证明货物，视图默认选中时展开。

| 源                       | 目标           | 类型          |
| ------------------------ | -------------- | ------------- |
| `evidence-delivery-note` | `thing-laptop` | `participant` |
