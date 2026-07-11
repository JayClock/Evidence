---
description: Run the Evidence Workflow TDD coding phase
---

Use `evidence_workflow_phase_prompt` with phase `coding`, then execute the returned instructions end-to-end. Identify the owning Nx/Cargo project, create colocated tests and real implementation under `apps/` or `libs/`, write Red/Green/Refactor evidence under `artifacts/05-code/`, run the focused Nx or Cargo quality gates, then call `evidence_workflow_complete_phase`. Do not create root-level `src/` or `tests/` directories.
