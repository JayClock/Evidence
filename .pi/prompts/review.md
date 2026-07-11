---
description: 运行 Evidence Workflow 评审阶段
---

使用 `evidence_workflow_phase_prompt`，phase 传入 `review`，然后端到端执行返回的指令。对照 DoD 审查 artifacts、`src/` 和 `tests/`，将评审报告写入 `artifacts/06-reviews/review-round<round>.md`，最后调用 `evidence_workflow_complete_phase`。

要求：评审报告必须使用中文撰写；代码、命令、路径、API 字段名和专有名词可以保留英文。
