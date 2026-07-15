---
name: evidence-pairing
description: Execute Navigator-controlled Evidence Pairing with short-lived Test and Production Drivers, observed Red/Green/Refactor checkpoints, path protection, and final quality gates. Use only after human Desk Check approves one Scenario plan. Do not batch checkpoints, self-accept Red, or let a Driver run commands.
---

# Evidence Pairing

## When to use

Use for the approved Pair loop. The human is Navigator; Drivers are short-lived and return after one bounded edit.

## Inputs

- One `US-xxx / SC-xxx`, clean Git baseline, confirmed Scenario, model expansion.
- Human-approved test/task list and immutable v2 process plans.
- Current ordered `TASK-xxx / TEST-xxx`, its model references, owning process step, and expected Red behavior.

## Checkpoint loop

1. Navigator activates exactly one approved `TASK-xxx / TEST-xxx`; the process step supplies boundaries and the locked command, but does not replace the task.
2. **Test Driver** writes only that TEST's nearest focused behavior test and returns without running it.
3. Controller runs the exact locked command and records Red against the active TASK/TEST identity.
4. Human classifies Red. Only an expected behavior failure may be accepted.
5. **Production Driver** writes the minimum implementation without changing confirmed tests.
6. Controller records Green.
7. Production Driver performs a bounded Refactor or explicit no-op.
8. Controller records Refactor and the model → TASK/TEST → changed-path trace.
9. Repeat for the next ordered TEST, including another TEST on the same process step. After every approved TASK/TEST completes, run each final quality gate once per revision cycle.
10. Generate execution evidence from observations; do not hand-copy commands, exits, paths, task ids, or model refs.

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
