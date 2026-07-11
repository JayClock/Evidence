---
description: Continue the Evidence Workflow pipeline safely
argument-hint: '[--dry-run|phase]'
---

Continue the Evidence Workflow pipeline for this repository.

Arguments: $ARGUMENTS

Rules:

- First inspect status with `evidence_workflow_status`.
- If a gate is pending and unanswered, stop and identify the gate file.
- Use `evidence_workflow_phase_prompt` for the current or requested phase.
- Execute the returned instructions end-to-end.
- Finish with `evidence_workflow_complete_phase`.
