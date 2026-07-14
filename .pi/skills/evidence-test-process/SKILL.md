---
name: evidence-test-process
description: Turn one confirmed Evidence Scenario into a reviewable Q2/Q1 test list, uniquely selected v2 test processes, boundaries, doubles, and ordered implementation tasks. Use in v5 Tasking, Desk Check preparation, or process-gap feedback. Do not guess among process matches, mix Rust and Nest, or write code.
---

# Evidence Test Process

## When to use

Use only after model challenge passes and before Pair. Reuse after architecture, strategy, or process feedback routes to Tasking.

## Inputs

- Confirmed Scenario, exact Then outcomes, and business data.
- Model expansion and generated context projection.
- Stable context map, test strategy, test doubles, runtime vocabulary, API contract, and v2 process catalog.

## Tasking sequence

1. List Q2 acceptance intent directly from each confirmed Then outcome and preserve business data verbatim.
2. Add Q1 tests that localize likely Q2 failures; non-goals never become reverse tests.
3. Separate dimensions:
   - functional context = stable business capability;
   - runtime = Rust, TypeScript, or Tauri;
   - technical boundary = API, ORM, UI, shell, etc.
4. Select Rust **or** Nest for one server capability, never both.
5. Match v2 processes by all capabilities and boundaries. Zero or multiple matches are knowledge gaps; do not choose heuristically.
6. Cover selected process steps in declared order, including real boundaries, replaced boundaries, doubles, focused-command variables, and final gates.
7. Build dependency-ordered tasks; every task references at least one `TEST-xxx`.
8. Call `evidence_orchestrator_propose_tasking` and stop for human Desk Check.

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
