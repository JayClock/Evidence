---
id: e-invoice-to-money-hidden
kind: association
name: InvoiceEvidenceToMoney
label: 证明金额
source: evidence-invoice
target: thing-payment-money
relationshipType: participant
direction: directed
cardinality: many-to-many
summary: 发票证明金额，视图默认选中时展开。
---

# 证明金额

发票证明金额，视图默认选中时展开。

| 源                 | 目标                  | 类型          |
| ------------------ | --------------------- | ------------- |
| `evidence-invoice` | `thing-payment-money` | `participant` |
