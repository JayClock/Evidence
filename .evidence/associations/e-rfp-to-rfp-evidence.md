---
id: e-rfp-to-rfp-evidence
kind: association
name: RfpToRfpEvidence
label: 留存
source: rfp-laptop
target: evidence-rfp-email
relationshipType: evidence
direction: directed
cardinality: many-to-many
summary: 询价单留存邮件记录。
---

# 留存

询价单留存邮件记录。

| 源           | 目标                 | 类型       |
| ------------ | -------------------- | ---------- |
| `rfp-laptop` | `evidence-rfp-email` | `evidence` |
