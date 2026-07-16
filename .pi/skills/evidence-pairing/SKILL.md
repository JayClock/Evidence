---
name: evidence-pairing
description: Execute controller-automated Evidence Pairing with short-lived Test, Production, and independent Red Reviewer agents; per-TEST Red/Green, one Refactor per process step, protected paths, bounded repair, recorded quality gates, and one human Story-level coding approval. Use only after human Desk Check approves one Story Scenario Set plan. Drivers never run commands or grant final approval.
---

# Evidence Pairing

## When to use

Use for the approved Pair loop. One `/evidence-run` lets the controller advance the complete coding Story until all gates pass or automation reaches an exception. Agents remain short-lived and perform one bounded role at a time; the human reviews authority once at the completed Story boundary.

## Inputs

- One `US-xxx` with its confirmed Scenario Set, clean Git baseline, and confirmed modeling evidence (combined expansion or `no_model_required` decision).
- Human-approved test/task list and immutable v2 process plans.
- Current ordered `TASK-xxx / TEST-xxx`, its model references, owning process step, and expected Red behavior.

## Automated checkpoint loop

1. Controller activates exactly one approved `TASK-xxx / TEST-xxx`; the process step supplies boundaries and the locked command.
2. **Test Driver** writes only that TEST's nearest focused behavior test and returns without running it.
3. Controller runs the exact locked command and records the actual result against the active TASK/TEST.
4. For a failing Red, an independent **Red Reviewer** classifies the direct cause from the intent and actual output. Only an assertion-level absence of the planned behavior is `behavior`; compile, dependency, configuration, network, fixture, and other failures are pseudo-Red.
5. A behavior Red automatically advances to **Production Driver**, which writes the minimum implementation without changing confirmed tests. A pseudo-Red returns to Test Driver within the bounded retry budget.
6. Controller records Green. A failed Green returns to Production Driver within the bounded retry budget.
7. If another ordered TEST remains in the same process step, repeat steps 1–6 without an intermediate Refactor.
8. After every TEST in the current process step is Green, Production Driver performs one bounded step-level Refactor or explicit no-op; the controller verifies it with the locked focused command.
9. Repeat for every process step, then run each final quality gate. A failed Refactor or gate receives bounded automated repair; exhausted retries stop as an exception rather than becoming approval.
10. Generate append-only execution evidence and the model → TASK/TEST → changed-path trace; for `method=none`, record Scenario → TASK/TEST → changed-path with empty model refs.
11. Stop after all gates pass. The human reviews the complete Story evidence once and records `/evidence-pair approve <reason>` before Showcase.

## Authority and safety

- Agents edit; only the controller runs locked commands and records exits, output hashes, Git/worktree hashes, identities, and paths.
- A Red Reviewer classifies evidence but does not grant human product authority.
- Drivers never modify plans, state, execution evidence, frozen tests outside their role, or Git HEAD. Boundary violations are restored and retried only within the budget.
- Automation never broadens Scenario scope, changes an approved plan, mixes Rust/Nest, weakens tests, or treats a pseudo-Red as behavior.
- Retry exhaustion, missing evidence, scope/architecture/process gaps, or an unrepairable quality gate stop for explicit exception routing.
- All gates passing is necessary but not sufficient: only the final human coding decision authorizes transition to Showcase.

## References

- Approved iteration `artifacts/04-planning/test-plan.json` (or versioned equivalent).
- `engineering/evidence-orchestrator/definition-of-done.md`
- Generated execution manifest, summary, and human coding decision under `artifacts/05-code/`.
