---
name: evidence-test-process
description: Turn one confirmed Evidence Story Scenario Set into one reviewable, deduplicated Q2/Q1 test list, uniquely selected v3 test processes, TEST-level Nx ownership and focus, boundaries, doubles, locked gates, and ordered implementation tasks. Use in Tasking, Desk Check preparation, or process-gap feedback. Do not guess among process matches, mix Rust and Nest, or write code.
---

# Evidence Test Process

## When to use

Use before Pair after either (a) a non-`none` expansion passes independent challenge and human model review, or (b) the human confirms `none/false` and the controller records no-model-impact evidence. Reuse after architecture, strategy, or process feedback routes to Tasking.

## Inputs

- Confirmed Scenario Set, every exact Then outcome, and business data.
- Confirmed modeling evidence: either model expansion plus generated context projection, or a `no_model_required` decision with empty model refs.
- Stable context map, test strategy, test doubles, runtime vocabulary, API contract, v3 process catalog, and resolved Nx project catalog.

## Tasking sequence

1. List Q2 acceptance intent directly from every confirmed Scenario/Then outcome and preserve business data verbatim; every Scenario and Then must be covered.
2. Add Q1 tests that localize likely Q2 failures and deduplicate support shared by multiple Scenarios; non-goals never become reverse tests.
3. Give every `TEST-xxx` explicit Scenario refs. For non-`none`, use `modelRefs` drawn only from the confirmed Story expansion and cover every expansion reference across the list. For `none`, every test must use empty model refs and trace directly Scenario → TASK/TEST.
4. Separate dimensions:
   - functional context = stable business capability;
   - runtime = Rust, TypeScript, or Tauri;
   - technical boundary = API, ORM, UI, shell, etc.
5. Select Rust **or** Nest for one server capability across the Story, never both.
6. Match v3 processes by all capabilities and boundaries. Zero or multiple matches are knowledge gaps; do not choose heuristically.
7. For every TypeScript runtime, list the complete planned Nx `projectIds`. Give every TEST its own safe `testFilter` and, exactly when the focused template uses `{{project}}`, the resolved owning `projectId`. The TEST project must own the nearest-test path, intersect the step roots, and expose a `test` target; never substitute an app project for a library owner.
8. Cover selected process steps in declared order, including real boundaries, replaced boundaries, doubles, per-TEST focused commands, and all materialized project/process gates. Missing required targets are process gaps.
9. Build one dependency-ordered Story task list. Every `TEST-xxx` belongs to exactly one task; task/test order must preserve process-step order. Task Scenario/model refs are the deterministic union of their tests.
10. Call `evidence_orchestrator_propose_tasking` and stop for human Desk Check.

## Project examples

- Web workspace display: Q2 rendered feature; Q1 component/resource behavior; real React feature; stub HTTP boundary; TypeScript Web process.
- Server workspace rule: choose Rust domain/Axum **or** Nest domain/controller from architecture ownership, never both.

## Feedback and exit conditions

- Scenario misunderstanding → Understand.
- Architecture gap → remain Tasking and update only stable architecture knowledge required by the Scenario.
- Process gap → add/fix one reusable v3 process or Nx project/target mapping, regenerate, then Desk Check.
- Candidate ready → stop; only `/evidence-desk-check ITER-xxxx` can approve.

## References

- `docs/architecture/test-strategy.md`
- `docs/architecture/test-doubles.md`
- `engineering/evidence-orchestrator/runtime-contexts.json`
- `engineering/evidence-orchestrator/test-processes/`
- `engineering/evidence-orchestrator/definition-of-done.md`
