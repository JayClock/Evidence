# Evidence Working Knowledge Governance

## Authority map

| Knowledge              | Authority                                                 | Iteration representation                            |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------------- |
| Requirement request    | GitHub Issue/Projects                                     | Frozen `issue.json` and read-only projection        |
| Product solution       | `docs/product/`                                           | Problem, journey slice and product/story-map deltas |
| Domain model           | `.evidence/`                                              | Model snapshot, delta and scenario expansion        |
| Architecture           | `docs/architecture/`                                      | Decisions and scenario context map                  |
| API contract           | `contracts/api.yaml`                                      | API contract delta                                  |
| Data model             | Migrations, Prisma schema and SeaORM entities             | Data-model delta                                    |
| Testing process        | `engineering/evidence-orchestrator/test-processes/`       | Selected immutable process snapshots                |
| Definition of Done     | `engineering/evidence-orchestrator/definition-of-done.md` | Git version plus scenario-specific additions        |
| Execution and feedback | `artifacts/iterations/`                                   | Immutable evidence                                  |

## Promotion lifecycle

1. Frame and later phases record proposed knowledge changes as iteration deltas.
2. The scenario tests whether the proposed knowledge explains and supports real behavior.
3. Review evaluates product value, architecture fit and quality.
4. Learn records each delta in `knowledge-promotion.json` as `promoted`, `deferred` or `rejected`.
5. A promoted item updates its canonical target while preserving the original delta as audit evidence.
6. The next iteration starts from the updated canonical knowledge and a new frozen Issue snapshot.

Historical iterations, including `ITER-0000`, are never rewritten even when their copied knowledge is obsolete.
