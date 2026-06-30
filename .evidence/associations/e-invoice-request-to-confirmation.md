---
id: e-invoice-request-to-confirmation
kind: association
name: InvoiceRequestToConfirmation
label: 开票履约确认
source: request-invoice
target: confirmation-invoice
relationshipType: fulfillment
direction: directed
cardinality: many-to-many
summary: 发票开具确认是发票开具申请的履约确认结果，表示该开票申请已完成。
---

# 开票履约确认

发票开具确认是发票开具申请的履约确认结果，表示该开票申请已完成。

| 源                | 目标                   | 类型          |
| ----------------- | ---------------------- | ------------- |
| `request-invoice` | `confirmation-invoice` | `fulfillment` |
