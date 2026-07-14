---
name: evidence-model-expansion
description: Expand one confirmed Scenario through the existing or candidate Evidence model, producing Given/When/Then model references, invariants, timeline, and minimal structured operations. Use after a human-confirmed modeling Profile and for independent model challenge. Do not directly edit .evidence or self-approve a candidate.
---

# Evidence Model Expansion

## When to use

Use for v5 model Builder expansion and read-only Challenger review. Load the method-specific Skill only when the confirmed Profile requires it.

## Inputs

- Confirmed Scenario and Profile.
- Canonical `.evidence` model.
- Historical regression/holdout Scenarios for Challenger only.
- Generated Mermaid, glossary, and context projections when challenging.

## Builder sequence

1. Map each Given fact to stable entity/association IDs.
2. Express the When as one business command/event, not a framework call.
3. Explain every Then as created/changed/removed model facts.
4. Record exact business data, invariants, and a temporal sequence.
5. If the existing model fails, identify concept absence, relationship error, lifecycle error, or method-specific invariant failure.
6. Propose the minimum structured add/update/remove operations; update/remove must cite the current SHA-256.
7. Call `evidence_orchestrator_record_model_analysis` and stop. Never write `.evidence` directly.

## Challenger sequence

1. Use only generated projections plus current and regression Scenarios.
2. Check concept coverage, relationship direction/meaning, lifecycle, timeline, invariants, and method fit.
3. Return exactly one of `pass`, `scenario_gap`, `model_gap`, or `method_gap` through `evidence_orchestrator_record_model_challenge`.
4. Never repair the candidate in the challenge session.

## Project examples

- Existing `workspace` and membership associations explain “owner sees Alpha” → no operations; expansion still records refs and invariant.
- A confirmation has no request relation → a relationship/lifecycle gap, not permission to redesign unrelated aggregates.

## Feedback and exit conditions

- Scenario gap → Understand/TQA.
- Model gap → Builder expansion.
- Method gap → Modeling Router.
- Regression failure → no pass.
- Pass → Tasking may consume the expansion.

## References

- `.evidence/README.md`
- `.evidence/scenarios/`
- `docs/knowledge-governance.md`
- For `business/eight_x_flow`: `../evidence-8x-flow/SKILL.md`
