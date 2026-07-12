---
id: e-invoice-confirmation-to-evidence
kind: association
name: InvoiceConfirmationToEvidence
label: 产生发票
source: confirmation-invoice
target: evidence-invoice
relationshipType: evidence
direction: directed
cardinality: many-to-many
summary: 开票确认产生发票凭证。
---

# 产生发票

开票确认产生发票凭证。

| 源                     | 目标               | 类型       |
| ---------------------- | ------------------ | ---------- |
| `confirmation-invoice` | `evidence-invoice` | `evidence` |
