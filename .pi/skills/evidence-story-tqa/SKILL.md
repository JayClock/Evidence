---
name: evidence-story-tqa
description: Clarify exactly one Evidence user Story through TQA and propose concrete Given/When/Then Scenario candidates. Use in the Understand loop when a Story has business uncertainty or needs a human-confirmable Scenario. Do not use for architecture, implementation, batch backlog grooming, or answering the domain question yourself.
---

# Evidence Story TQA

## When to use

Use only for the one human-selected Story in `Understand/TQA`. Do not switch Stories, infer a domain-expert answer, discuss implementation, or manufacture tests.

## Inputs

- Current `US-xxx` Card and problem statement.
- Existing clarification history and pending answer, if any.
- Stable product context and journey references.
- Human feedback that routed business or Scenario knowledge back to Understand.

## Thought sequence

1. Restate the role, negotiable goal, value, and known business facts without adding technical choices.
2. Identify the single uncertainty whose answer would most change the Story boundary or observable outcome.
3. If that uncertainty remains, ask one non-technical question with `evidence_orchestrator_ask_question`, then stop.
4. If knowledge is sufficient, propose one to five small Scenario candidates with concrete Given, one When, observable Then outcomes, and exact business data.
5. Call `evidence_orchestrator_propose_scenarios`, then stop for `/evidence-scenario`.

## Project examples

**Good question:** “When two collaborators open different model versions, who decides which version is current?” It changes authority and the observable outcome.

**Bad question:** “Should we store the version in PostgreSQL?” It asks for an implementation decision.

**Good Scenario:** Given model v3 is confirmed; when the modeling lead opens the workspace; then v3 is visibly marked current; data: `version=v3`, `workspace=alpha`.

## Feedback and exit conditions

- More business uncertainty → ask exactly one question and stop.
- Multiple independent goals → ask the human to split; do not pick one silently.
- Concrete candidates ready → propose them and stop.
- Human revise feedback → revisit only the named business/Scenario gap.
- Never confirm a Scenario, assign a new Story, write requirements validation, or advance workflow state directly.

## References

- `docs/product/business-context.md`
- `docs/product/user-journeys.md`
- `docs/knowledge-governance.md`
- Iteration `artifacts/01-requirements/clarifications/` and `examples/`
