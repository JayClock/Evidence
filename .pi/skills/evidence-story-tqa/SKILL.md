---
name: evidence-story-tqa
description: Clarify exactly one Evidence user Story through TQA and propose concrete Given/When/Then Scenario candidates. Use in the Understand loop when a Story has business uncertainty, may need revision, or needs a human-confirmable Scenario. Product-confirmed channels and external interactions may be clarified, but do not use this skill for internal architecture, implementation choices, batch backlog grooming, or answering the domain question yourself.
---

# Evidence Story TQA

## When to use

Use only for the one active WIP Story in `Understand/TQA`. A delivery iteration may contain multiple Stories and a Story may accumulate multiple confirmed Scenarios, but this activity must not switch Stories, infer a domain-expert answer, choose internal implementation technology, or manufacture tests.

## Inputs

- Current `US-xxx` Card and problem statement.
- Existing clarification history and pending answer, if any.
- Stable product context and journey references.
- Human feedback that routed business or Scenario knowledge back to Understand.

## Thought sequence

1. Read the role, negotiable goal, value, overall solution, user journey, Story Map, known business facts, and clarification history without adding a product or technical choice.
2. Identify the single uncertainty whose answer would most change the Story boundary or observable outcome.
3. Route the question by what its answer changes:
   - `business_context` for concepts, rules, authority, journey, or product-wide facts;
   - `story` when the current role, negotiable goal, or value is wrong;
   - `history` for a local detail that need not revise stable context or the Card.
4. If that uncertainty remains, ask one business-facing question with `evidence_orchestrator_ask_question`, then stop. A confirmed channel, external interface, or user interaction may be clarified when needed for an observable Scenario; do not ask the domain expert to choose frameworks, databases, runtimes, internal components, or tests.
5. If knowledge is sufficient, propose one to five small Scenario candidates with concrete Given, one When, observable Then outcomes, and exact business data. Product-visible interaction may appear only when already confirmed; internal implementation steps never appear.
6. Call `evidence_orchestrator_propose_scenarios`, then stop for `/evidence-scenario`.

## Project examples

**Good question:** “When two collaborators open different model versions, who decides which version is current?” It changes authority and the observable outcome.

**Good product-interaction question:** “Must the integration partner receive the confirmed model through the published API, or is another delivery channel valid?” Ask it only when the channel is not already confirmed and changes the observable acceptance boundary.

**Bad question:** “Should we store the version in PostgreSQL?” It asks for an internal implementation decision.

**Bad question:** “Should the API use Axum or Nest?” Runtime selection belongs to Tasking.

**Good Scenario:** Given model v3 is confirmed; when the modeling lead opens the workspace; then v3 is visibly marked current; data: `version=v3`, `workspace=alpha`.

## Feedback and exit conditions

- More business uncertainty → ask exactly one question and stop.
- The answer corrects the Card → target `story`; after the explicit answer, the orchestrator returns to Kickoff for a replacement candidate and human confirmation rather than appending Conversation to the Card.
- Multiple independent goals → ask the human to split; do not pick one silently.
- Concrete candidates ready → propose them and stop. After one Scenario is implemented, the Navigator may return to this same Story to clarify and confirm another acceptance Scenario.
- Human revise feedback → revisit only the named business/Scenario gap.
- Never confirm a Scenario, assign a new Story, write requirements validation, or advance workflow state directly.

## References

- `docs/product/business-context.md`
- `docs/product/user-journeys.md`
- `docs/knowledge-governance.md`
- Iteration `artifacts/01-requirements/clarifications/` and `examples/`
