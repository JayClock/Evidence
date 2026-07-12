---
id: e-payment-confirmation-to-invoice-request
kind: association
name: PaymentConfirmationToInvoiceRequest
label: 触发开票
source: confirmation-payment
target: request-invoice
relationshipType: business_dependency
direction: directed
cardinality: many-to-many
summary: 付款确认后触发开票申请。
---

# 触发开票

付款确认后触发开票申请。

| 源                     | 目标              | 类型                  |
| ---------------------- | ----------------- | --------------------- |
| `confirmation-payment` | `request-invoice` | `business_dependency` |
