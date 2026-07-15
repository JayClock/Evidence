---
name: evidence-model-expansion
description: Expand every Scenario in one confirmed Story Scenario Set through the existing or candidate Evidence model, producing per-Scenario Given/When/Then references, invariants, timelines, and one minimal structured proposal. Use after a human-confirmed modeling Profile and for independent model challenge. Do not directly edit .evidence or self-approve a candidate.
---

# Evidence Model Expansion

## When to use

Use for model Builder expansion of one confirmed Scenario Set and read-only Challenger review of the combined Story model. Load the method-specific Skill only when the confirmed Profile requires it.

## Inputs

- Confirmed Story Scenario Set and Profile.
- Canonical `.evidence` model.
- Historical regression/holdout Scenarios for Challenger only.
- Generated Mermaid, glossary, and context projections when challenging.

## Builder sequence

1. For every confirmed Scenario, map each Given fact to stable entity/association IDs.
2. Express each When as one business command/event, not a framework call.
3. Explain every Then as created/changed/removed model facts.
4. Record per-Scenario exact business data, invariants, and temporal sequence.
5. Check concept, relationship, lifecycle, invariant, and timeline consistency across the complete set.
6. If the existing model fails, identify concept absence, relationship error, lifecycle error, or method-specific invariant failure.
7. Propose one minimum structured add/update/remove operation set for the Story; update/remove must cite the current SHA-256.
8. Call `evidence_orchestrator_record_model_analysis` once and stop. Never write `.evidence` directly.

## Challenger sequence

1. Use only generated projections plus the complete current Scenario Set and regression Scenarios.
2. Check per-Scenario coverage, cross-Scenario consistency, relationship direction/meaning, lifecycle, timeline, invariants, and method fit.
3. Return exactly one of `pass`, `scenario_gap`, `model_gap`, or `method_gap` through `evidence_orchestrator_record_model_challenge`.
4. Never repair the candidate in the challenge session. A pass only prepares human review; it does not approve the model or advance Tasking.

## Project examples

- Existing `workspace` and membership associations explain “owner sees Alpha” → no operations; expansion still records refs and invariant.
- A confirmation has no request relation → a relationship/lifecycle gap, not permission to redesign unrelated aggregates.

## Feedback and exit conditions

- Scenario gap → Understand/TQA.
- Model gap → Builder expansion.
- Method gap → Modeling Router.
- Regression failure → no pass.
- Pass → human reviews Mermaid, glossary, Scenario expansion and exact proposal.
- Human confirm → Tasking may consume the expansion; an approved Desk Check applies the exact proposal on the shared Pair Git baseline.

## References

- `.evidence/README.md`
- `.evidence/scenarios/`
- `docs/knowledge-governance.md`
- For `business/eight_x_flow`: `../evidence-8x-flow/SKILL.md`
