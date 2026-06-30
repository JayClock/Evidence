---
id: e-invoice-to-platform
kind: association
name: InvoiceToPlatform
label: 来源系统
source: evidence-invoice
target: third-invoice-platform
relationshipType: external_reference
direction: directed
cardinality: many-to-many
summary: 发票来源于电子发票平台。
---

# 来源系统

发票来源于电子发票平台。

| 源                 | 目标                     | 类型                 |
| ------------------ | ------------------------ | -------------------- |
| `evidence-invoice` | `third-invoice-platform` | `external_reference` |
