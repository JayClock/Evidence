---
description: Render a concise human reading of an already-generated deterministic execution manifest
argument-hint: '<MANIFEST-JSON>'
---

Read `$1`. Summarize only facts already present:

- Story/Scenario and Git baseline;
- model refs, ordered TASK/TEST units, Q1/Q2 process steps, contexts, doubles, and code paths;
- each TEST's independently classified Red and passed Green, each process step's shared Refactor, final gates, and automated Showcase Q2;
- applied model/code consistency hashes and residual failed attempts.

Do not infer missing exits, rewrite the manifest, run commands, or claim user value beyond observed Showcase facts.
