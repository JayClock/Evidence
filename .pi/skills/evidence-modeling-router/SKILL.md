---
name: evidence-modeling-router
description: Select the modeling subject and method for one confirmed Evidence Story Scenario Set, deciding whether the canonical model must change. Use during Understand modeling Profile or after model/method feedback. Do not use as a universal DDD checklist or to edit .evidence directly.
---

# Evidence Modeling Router

## When to use

Use after a human confirms one Story Scenario Set and before model expansion. Reuse it when Showcase routes `model` or `modeling_method` feedback to Understand.

## Inputs

- Complete confirmed Scenario Set and business data.
- Existing `.evidence` entities, associations, and model metadata.
- Current cognitive behavior and prior model feedback.

## Routing sequence

1. Try to explain every Scenario and their cross-Scenario consistency with the existing model first.
2. Classify the subject:
   - `business`: commitments, roles, KPI/SLA, evidence, or operational variation;
   - `domain`: the problem-domain capability itself;
   - `tool`: editor, integration, automation, or glue behavior.
3. Select only the method needed now:
   - `none` only when a tool/glue Story has no useful canonical model semantics, regardless of whether the visible change is UI, API, integration, automation, or another delivery mechanism;
   - `object` for stable concepts/relationships;
   - `event` for lifecycle and event-flow uncertainty;
   - `four_color` for time-sensitive roles, parties, places, and descriptions;
   - `eight_x_flow` only for a business system with commitments and fulfillment;
   - `algorithmic` for deterministic rules or calculation.
4. Decide `modelChangeRequired=true|false|unknown`; unknown must return to human Profile review. `method=none` may only pair with `false`.
5. Explain the resulting route:
   - `none/false` → deterministic no-model-impact evidence, then Tasking; no Builder or Challenger;
   - non-`none`/`false` → expand through the existing model with `operations=[]`, then challenge and human review;
   - non-`none`/`true` → expand one minimal candidate operation set, then challenge and human review.
6. Call `evidence_orchestrator_propose_modeling_profile` and stop.

## Project examples

- A pricing formula with deterministic inputs → `domain/algorithmic`, not 8X.
- A workspace editor, API adapter, or automation change with no canonical semantics → `tool/none`; the delivery channel is not the deciding factor.
- Existing Workspace concepts explain a changed rule → `domain/object` with `modelChangeRequired=false`, not `none`.
- Procurement obligations and fulfillment evidence → `business/eight_x_flow`; then load `../evidence-8x-flow/SKILL.md`.

## Feedback and exit conditions

- Missing business facts → route to TQA, not a guessed method.
- Existing model explains everything → `modelChangeRequired=false`.
- Wrong method found by Challenger → return to Profile and rerun this Skill.
- Stop after proposing the Profile; only the human confirms it.

## References

- `.evidence/model.json`
- `.evidence/entities/`
- `.evidence/associations/`
- `docs/knowledge-governance.md`
