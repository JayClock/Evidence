---
name: evidence-workflow-tdd
description: 'Implement real code increments from evidence-workflow user stories using TDD. Use when converting generated TDD markdown artifacts into actual src/ and tests/ files or improving the coding phase.'
---

# Evidence Workflow TDD

Use this skill for the coding phase or when the user asks to turn generated implementation markdown into runnable code.

## Workflow

1. Pick the target user story from `artifacts/04-planning/sprint-1-backlog.md`.
2. Read API contracts from `artifacts/03-architecture/api-contracts.md` and DoD from `artifacts/04-planning/definition-of-done.md`.
3. Red: create or update real tests under `tests/<story-id>/`.
4. Green: implement the minimum real production code under `src/`.
5. Refactor: improve names and structure without changing external behavior.
6. Run the relevant test command when available.
7. Keep `artifacts/05-code/*` as review notes, not the only implementation output.

## Important

Do not stop at Markdown pseudo-code when the user asks for implementation. Write real files and run tests where possible.
