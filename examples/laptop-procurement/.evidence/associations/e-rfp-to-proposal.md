---
id: e-rfp-to-proposal
kind: association
name: RfpToProposal
label: 提交报价
source: rfp-laptop
target: proposal-laptop
relationshipType: timeline
direction: directed
cardinality: many-to-many
summary: RFP 推进到 Proposal。
---

# 提交报价

RFP 推进到 Proposal。

| 源           | 目标              | 类型       |
| ------------ | ----------------- | ---------- |
| `rfp-laptop` | `proposal-laptop` | `timeline` |
