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

## Decision for P0-03 / P0-04

P0-03 may use the 17,110-byte idle status measurement as its pre-reduction baseline. P0-04 must remain shadow-only for token/cost limits until a human recognizes at least one real Story run; the controlled values above must not be copied into an execution budget.
