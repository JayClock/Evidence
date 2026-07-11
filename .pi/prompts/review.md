---
description: Run the Pi-native review phase
---

Use `evidence_workflow_phase_prompt` with phase `review`, then execute the returned instructions end-to-end. Review artifacts, `src/`, and `tests/` against DoD, write `artifacts/06-reviews/review-round<round>.md`, then call `evidence_workflow_complete_phase`.
