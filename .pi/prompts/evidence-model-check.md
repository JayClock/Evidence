---
description: Perform a bounded structural check of one Evidence model projection without changing workflow state
argument-hint: '<SCENARIO-PATH> [MODEL-CONTEXT-PATH]'
---

Read `$1` and `${2:-.evidence/model.json}`. Report only:

1. model concepts that cannot express a Given/When/Then fact;
2. associations with missing/unknown endpoints or unclear direction;
3. lifecycle, invariant, or timeline contradictions;
4. whether this is a Scenario gap, model gap, or method gap.

This is a Clear, read-only check. Do not edit `.evidence`, create a candidate, call workflow tools, or start an activity subagent.
