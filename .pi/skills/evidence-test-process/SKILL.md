---
name: evidence-test-process
description: Turn one confirmed Evidence Story Scenario Set into one reviewable, deduplicated Q2/Q1 test list, uniquely selected v2 test processes, boundaries, doubles, and ordered implementation tasks. Use in Tasking, Desk Check preparation, or process-gap feedback. Do not guess among process matches, mix Rust and Nest, or write code.
---

# Evidence Test Process

## When to use

Use only after the independent model challenge passes **and a human confirms the model and ubiquitous language**, before Pair. Reuse after architecture, strategy, or process feedback routes to Tasking.

## Inputs

- Confirmed Scenario Set, every exact Then outcome, and business data.
- Human-confirmed model expansion and generated context projection, including stable entity and association ids.
- Stable context map, test strategy, test doubles, runtime vocabulary, API contract, and v2 process catalog.

## Tasking sequence

1. List Q2 acceptance intent directly from every confirmed Scenario/Then outcome and preserve business data verbatim; every Scenario and Then must be covered.
2. Add Q1 tests that localize likely Q2 failures and deduplicate support shared by multiple Scenarios; non-goals never become reverse tests.
3. Give every `TEST-xxx` explicit Scenario refs and `modelRefs` drawn only from the confirmed Story expansion. Across the test list, cover every expansion reference; method `none` is the only valid empty trace.
4. Separate dimensions:
   - functional context = stable business capability;
   - runtime = Rust, TypeScript, or Tauri;
   - technical boundary = API, ORM, UI, shell, etc.
5. Select Rust **or** Nest for one server capability across the Story, never both.
6. Match v2 processes by all capabilities and boundaries. Zero or multiple matches are knowledge gaps; do not choose heuristically.
7. Cover selected process steps in declared order, including real boundaries, replaced boundaries, doubles, focused-command variables, and final gates.
8. Build one dependency-ordered Story task list. Every `TEST-xxx` belongs to exactly one task; task/test order must preserve process-step order. Task Scenario/model refs are the deterministic union of their tests.
9. Call `evidence_orchestrator_propose_tasking` and stop for human Desk Check.

## Project examples

- Web workspace display: Q2 rendered feature; Q1 component/resource behavior; real React feature; stub HTTP boundary; TypeScript Web process.
- Server workspace rule: choose Rust domain/Axum **or** Nest domain/controller from architecture ownership, never both.

## Feedback and exit conditions

- Scenario misunderstanding → Understand.
- Architecture gap → remain Tasking and update only stable architecture knowledge required by the Scenario.
- Process gap → add/fix one reusable v2 process, regenerate, then Desk Check.
- Candidate ready → stop; only `/evidence-desk-check` can approve.

## References

- `docs/architecture/test-strategy.md`
- `docs/architecture/test-doubles.md`
- `engineering/evidence-orchestrator/runtime-contexts.json`
- `engineering/evidence-orchestrator/test-processes/`
- `engineering/evidence-orchestrator/definition-of-done.md`
