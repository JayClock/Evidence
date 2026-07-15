---
description: Format an existing Scenario test draft into the Evidence Q2/Q1 review structure
argument-hint: '<SCENARIO-PATH> <DRAFT-PATH>'
---

Read the confirmed Scenario `$1` and existing draft `$2`. Reformat—without inventing behavior—into:

- exact Scenario outcome and business data;
- confirmed model entity/association ids exercised by each test intent;
- Q2 test intents mapped to Then outcomes;
- Q1 support intents mapped to each Q2;
- owning runtime, functional context, and technical boundaries as separate fields;
- one TASK owner per TEST, ordered without violating process steps;
- unresolved model-trace or zero/multiple process matches.

Do not choose a process, write code, change state, or expand non-goals. Return Markdown only.
