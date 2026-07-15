---
name: evidence-modeling-router
description: Select the modeling subject and method for one confirmed Evidence Scenario, deciding whether the canonical model must change. Use during Understand modeling Profile or after model/method feedback. Do not use as a universal DDD checklist or to edit .evidence directly.
---

# Evidence Modeling Router

## When to use

Use after a human confirms one Scenario and before model expansion. Reuse it when Showcase routes `model` or `modeling_method` feedback to Understand.

## Inputs

- Confirmed Scenario and business data.
- Existing `.evidence` entities, associations, and model metadata.
- Current cognitive behavior and prior model feedback.

## Routing sequence

1. Try to explain the Scenario with the existing model first.
2. Classify the subject:
   - `business`: commitments, roles, KPI/SLA, evidence, or operational variation;
   - `domain`: the problem-domain capability itself;
   - `tool`: editor, integration, automation, or glue behavior.
3. Select only the method needed now:
   - `none` for a tool with no useful domain semantics;
   - `object` for stable concepts/relationships;
   - `event` for lifecycle and event-flow uncertainty;
   - `four_color` for time-sensitive roles, parties, places, and descriptions;
   - `eight_x_flow` only for a business system with commitments and fulfillment;
   - `algorithmic` for deterministic rules or calculation.
4. Decide `modelChangeRequired=true|false|unknown`; unknown must return to human Profile review.
5. Call `evidence_orchestrator_propose_modeling_profile` and stop.

## Project examples

- A pricing formula with deterministic inputs → `domain/algorithmic`, not 8X.
- A workspace editor integration with no new business concept → `tool/none`.
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
