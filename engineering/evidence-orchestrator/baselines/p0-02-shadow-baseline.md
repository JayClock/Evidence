# P0-02 Shadow Activity Baseline

- Captured: 2026-07-17
- Code baseline: `d9358cc`
- Mode: shadow telemetry / controlled fixture
- Authority: diagnostic only; not a token, cost, timeout, or approval policy

## Pre-P0-03 parent status surface

Measured with `statusMarkdown(process.cwd())` while no iteration was active:

| Metric                                  |  Value |
| :-------------------------------------- | -----: |
| UTF-8 bytes visible to the parent model | 17,110 |
| Lines                                   |    323 |
| `apps/` / `libs/` code-file rows        |    308 |

This is the context-reduction comparison point for P0-03.

## Controlled non-Pair activity fixture

The deterministic aggregation fixture in `capabilities/activity-observability/summary.spec.ts` records one representative model completion with:

| Metric                |      Value |
| :-------------------- | ---------: |
| Assistant turns       |          2 |
| Input tokens          |      1,000 |
| Cache-read tokens     |        800 |
| Cache-write tokens    |         20 |
| Output tokens         |        100 |
| Context tokens at end |      1,120 |
| Reported cost         | USD 0.1000 |
| Duration              |      1.0 s |

These are controlled contract values, not a provider performance claim.

## Controlled 3-TEST Pair shape

For 3 TESTs across 2 selected process steps and 2 final quality gates, the locked Pair structure predicts:

| Activity                          |  Count |
| :-------------------------------- | -----: |
| Test Driver                       |      3 |
| Red Reviewer                      |      3 |
| Production Driver (Green)         |      3 |
| Production Driver (step Refactor) |      2 |
| **Model activity calls**          | **11** |
| Red/Green deterministic commands  |      6 |
| Refactor verification commands    |      2 |
| Final quality-gate commands       |      2 |
| Pair parent span                  |      1 |
| **Total started spans**           | **22** |

Applying the controlled non-Pair sample to each of the 11 model calls, and 0.5 s to each deterministic child, exercises this expected aggregate:

| Metric                                        | Controlled value |
| :-------------------------------------------- | ---------------: |
| Input / output tokens                         |   11,000 / 1,100 |
| Cache read / write tokens                     |      8,800 / 220 |
| Reported cost                                 |       USD 1.1000 |
| Model child duration                          |           11.0 s |
| Deterministic child duration                  |            5.0 s |
| Pair parent wall time                         |           16.0 s |
| Trace cumulative duration (children + parent) |           32.0 s |

These values validate arithmetic and parent/child accounting only; they are not representative Pair limits.

## Persistent TQA and cache baseline

A controlled two-checkpoint persistent TQA fixture records:

| Checkpoint |    Input | Cache read |  Output | Context at end |
| :--------- | -------: | ---------: | ------: | -------------: |
| TQA-1      |    1,000 |        800 |     100 |          1,120 |
| TQA-2      |    1,500 |      1,200 |     120 |          1,760 |
| **Growth** | **+500** |   **+400** | **+20** |       **+640** |

The controlled fixed-prefix cache-read ratio is 80% (`cacheRead / input`) for both checkpoints and for each sample agent call. This verifies that cache fields and final context remain separately observable. It is not a claim about a real provider cache hit rate.

A real persistent-session provider run was not available at this iteration boundary. Real measurements still required before P0-04 policy activation are the same non-Pair, TQA, 3-TEST Pair, and per-agent metrics above from a human-recognized Story.

## Post-P0-03 context-surface comparison

- Captured: 2026-07-17
- Code baseline: `bb454c2` (Capsule starts at `6ec564d`; bounded status at `2f47066`)
- Method: the same idle `statusMarkdown(process.cwd())` measurement plus deterministic publication contracts

### Parent status surface

| Metric                                  | Before P0-03 | After P0-03 | Change |
| :-------------------------------------- | -----------: | ----------: | -----: |
| UTF-8 bytes visible to the parent model |       17,110 |         306 | -98.2% |
| Lines                                   |          323 |          11 |   -312 |
| `apps/` / `libs/` code-file rows        |          308 |           0 |   -308 |

The default path no longer calls the code-file inventory. Active status returns the same bounded summary projection plus artifact counts; artifact and human-only code-file details require explicit cursor pagination and return at most 50 items per page.

### Parent activity-result surface

| Invocation/result                           | Before P0-03                             | After P0-03 model-visible surface                        |
| :------------------------------------------ | :--------------------------------------- | :------------------------------------------------------- |
| Successful command activity                 | Full `details.output` custom message     | 0 bytes; bounded custom entry is TUI/session only        |
| Pair all-green command summary              | Full success custom message              | 0 bytes; bounded custom entry plus status next action    |
| HTML change explanation completion          | Full success custom message              | 0 bytes; bounded custom entry with output/metadata refs  |
| Pending TQA question                        | Unbounded success custom message         | Complete question, hard maximum 2 KiB                    |
| Human-routed activity failure               | Unbounded success/failure custom message | Reason, next action, and reference, hard maximum 2 KiB   |
| `run_activity` / continued-TQA tool content | Full child final output                  | Hard maximum 2 KiB; full child events remain TUI details |

Custom-entry data is bounded to 8 KiB and contains only activity summary, usage, child-event count, and disk references; it does not duplicate delegated tasks, stderr, or child messages.

### Child activity context

- Every Inbox, loop, Pair reviewer/driver, and Change Explainer dispatch starts with a deterministic Context Capsule capped at 16 KiB; overflow fails closed.
- Capsules carry current IDs, one requested outcome, human authority/hashes, exact input paths, TASK/TEST/process/step where applicable, enforced tools/write roots, output schema, and stop condition.
- TQA names its exact clarification-history artifact; persistent session history remains a cache rather than an authority source.
- Ten non-Inbox activity roles no longer receive `evidence_orchestrator_status`.
- Child prompt-template auto-discovery is disabled; project `AGENTS.md` context remains enabled.

### Usage/cache/context trace comparison

The pre-P0-03 controlled non-Pair, persistent-TQA, and 3-TEST Pair arithmetic above remains the only available trace fixture. This implementation boundary had no human-recognized provider Story run, so post-change provider input/cache/context values are deliberately not fabricated:

| Trace shape       | Pre-P0-03 fixture                              | Post-P0-03 provider observation  |
| :---------------- | :--------------------------------------------- | :------------------------------- |
| Non-Pair activity | 1,000 input / 800 cache read / 1,120 context   | Not yet measured on a real Story |
| Persistent TQA-2  | 1,500 input / 1,200 cache read / 1,760 context | Not yet measured on a real Story |
| 3-TEST Pair       | 11,000 input / 8,800 cache read / 1,100 output | Not yet measured on a real Story |

Correctness is gated by byte limits, bounded publication contracts, Capsule tests, full-loop integration, Pair automation, TQA persistence, source boundaries, and idle recovery—not by a single stochastic model run. The next human-recognized non-Pair, TQA, and 3-TEST Pair traces must be appended here before P0-04 activates token/cost policy.

## Decision for P0-03 / P0-04

P0-03 demonstrates a deterministic 98.2% reduction in the idle parent status surface and removes ordinary successful command results from parent model context. P0-04 must remain shadow-only for token/cost limits until a human recognizes at least one real Story run; the controlled values above must not be copied into an execution budget.
