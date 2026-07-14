---
name: evidence-pairing
description: Execute Navigator-controlled Evidence Pairing with short-lived Test and Production Drivers, observed Red/Green/Refactor checkpoints, path protection, and final quality gates. Use only after human Desk Check approves one Scenario plan. Do not batch checkpoints, self-accept Red, or let a Driver run commands.
---

# Evidence Pairing

## When to use

Use for the approved v5 Pair loop. The human is Navigator; Drivers are short-lived and return after one bounded edit.

## Inputs

- One `US-xxx / SC-xxx`, clean Git baseline, confirmed Scenario, model expansion.
- Human-approved test/task list and immutable v2 process plans.
- Current process step and expected Red behavior.

## Checkpoint loop

1. **Test Driver** writes only the nearest focused behavior test and returns without running it.
2. Controller runs the exact locked command and records Red.
3. Human classifies Red. Only an expected behavior failure may be accepted.
4. **Production Driver** writes the minimum implementation without changing confirmed tests.
5. Controller records Green.
6. Production Driver performs a bounded Refactor or explicit no-op.
7. Controller records Refactor.
8. Repeat for the next process step; after all steps, run each final quality gate once per revision cycle.
9. Generate execution evidence from observations; do not hand-copy commands, exits, or paths.

## Project examples

- Test Driver touches `apps/web/tests/workspace.test.ts`; a production edit is restored and blocks the checkpoint.
- Rust Test Driver may change only the `#[cfg(test)]` region; Production Driver may change only the production region in the same file.

## Feedback and exit conditions

- Compile/dependency/config/network/fixture failure is not Red → return to Test Driver or Tasking.
- Green failure → implementation feedback, not Refactor.
- Quality-gate failure → human chooses retry, implementation, test, or Tasking.
- Every gate passes → stop; `/evidence-run` enters Showcase.
- Never commit, modify plans/state/logs, or advance a second checkpoint in one Driver turn.

## References

- Approved iteration `artifacts/04-planning/test-plan.json` (or versioned equivalent).
- `engineering/evidence-orchestrator/definition-of-done.md`
- Generated execution manifest and summary under `artifacts/05-code/`.
