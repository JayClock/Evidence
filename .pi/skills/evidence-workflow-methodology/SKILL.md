---
name: evidence-workflow-methodology
description: "Run methodology-driven evidence-workflow phases: Design Thinking requirements, DDD domain modeling, architecture design, Scrum planning, gates, and artifact review. Use when working on this repository's evidence-workflow workflow or refactoring it into Pi."
---

# Evidence Workflow Methodology

Use this skill when the user asks to run, inspect, improve, or extend the evidence-workflow workflow.

## Workflow

1. Read `evidence-state.json` to identify the current phase, round, and pending gate.
2. Use `artifacts/00-user-input/requirements.md` as the seed requirement input.
3. Preserve `artifacts/*` as the auditable source of truth.
4. Apply these embedded project skills by phase:
   - `requirements`: `.pi/skills/design-thinking/SKILL.md`
   - `domain_model`: `.pi/skills/ddd/SKILL.md`
   - `architecture`: `.pi/skills/ddd/SKILL.md` plus architecture outputs
   - `planning`: `.pi/skills/scrum/SKILL.md`
   - `coding`: `.pi/skills/tdd/SKILL.md`
   - `review`: strict code and artifact review against DoD
5. Prefer small, deterministic artifact writes over broad rewrites.
6. If a gate is pending, inspect `artifacts/gates/<gate>.md`; do not proceed unless it has a concrete answer replacing `<!-- 在此填写 -->`.

## Pi Commands

Project extension commands:

```bash
/evidence-status              # show phase, gate, artifacts
/evidence-run                 # run current phase through existing pipeline
/evidence-run --dry-run       # validate pipeline routing without API calls
/evidence-run requirements    # run a specific phase
/evidence-reset               # reset evidence-state.json
/evidence-gate 通过，进入下一阶段
```

## Definition of Done

- State is updated in `evidence-state.json`.
- Generated artifacts are Markdown and committed-friendly.
- Gates remain human-readable Markdown.
- CI can still run the workflow non-interactively.
