---
id: e-proposal-to-contract
kind: association
name: ProposalToContract
label: 签订合同
source: proposal-laptop
target: contract-laptop-purchase
relationshipType: context_transition
direction: directed
cardinality: many-to-many
summary: 报价被接受后进入合约上下文。
---

# 签订合同

报价被接受后进入合约上下文。

| 源                | 目标                       | 类型                 |
| ----------------- | -------------------------- | -------------------- |
| `proposal-laptop` | `contract-laptop-purchase` | `context_transition` |
