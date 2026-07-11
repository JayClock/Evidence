---
name: evidence-workflow-tdd
description: 'Implement real code increments from evidence-workflow user stories using TDD. Use when converting generated TDD markdown artifacts into actual src/ and tests/ files or improving the coding phase.'
---

# Evidence Workflow TDD

Use this skill for the coding phase or when the user asks to turn generated implementation markdown into runnable code.

## Workflow

1. Pick the target user story from `artifacts/04-planning/sprint-1-backlog.md`.
2. Read API contracts from `artifacts/03-architecture/api-contracts.md` and DoD from `artifacts/04-planning/definition-of-done.md`.
3. Determine the owning Evidence project from the story and architecture artifacts.
4. Red: create or update a colocated test in the owning `apps/*` or `libs/*` project, then run it and record the expected failure.
5. Green: implement the minimum production change in that project and rerun the focused test.
6. Refactor: improve names and structure without changing external behavior, then run the applicable Nx or Cargo quality gates.
7. Record the story ID, changed paths, Red/Green/Refactor evidence, and command results in `artifacts/05-code/*`.

## Important

Do not stop at Markdown pseudo-code when the user asks for implementation. Write real files and run tests where possible. Never create generic root-level `src/` or `tests/` directories: React and shared UI belong under `apps/web` or `libs/web/*`, Rust under `apps/server` or `libs/server/*`, Nest under `apps/server-nest` or `libs/server-nest/*`, and desktop-only code under `apps/desktop/src-tauri`.
