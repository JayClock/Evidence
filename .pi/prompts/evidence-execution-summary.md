---
description: Render a concise human reading of an already-generated deterministic execution manifest
argument-hint: '<MANIFEST-JSON>'
---

Read `$1`. Summarize only facts already present:

- Story/Scenario and Git baseline;
- Q1/Q2 process steps, contexts, doubles, and code paths;
- accepted Red, passed Green/Refactor, final gates, and Showcase Q2;
- model/code consistency hashes and residual failed attempts.

Do not infer missing exits, rewrite the manifest, run commands, or claim user value beyond observed Showcase facts.
