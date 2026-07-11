# Review Round 0 — Coding Phase

## Review Scope

- Phase under review: `coding`
- Story implemented: US-001 / PBI-001 — API Root 默认入口
- Reviewed artifacts:
  - `artifacts/05-code/us-001-api-root-tdd.md`
  - `artifacts/04-planning/definition-of-done.md`
  - `artifacts/03-architecture/module-structure.md`
  - `evidence-state.json`
- Reviewed source and tests:
  - `libs/server/api/src/api/root.rs`
  - `libs/server/api/tests/root_contract.rs`
  - `libs/server/api/Cargo.toml`
  - `Cargo.lock`

## Summary

The coding phase completed a small, valid TDD increment for US-001. It added a real Axum Router integration test for `GET /api`, verified the HAL root links and vendor media type, added the necessary test-only `tower` dependency, and performed a minimal refactor by extracting `DEFAULT_USER_ID` in the root API handler.

## DoD Assessment

- ✅ At least one Sprint 1 story was implemented or repaired: US-001.
- ✅ Test-first evidence exists: `artifacts/05-code/us-001-api-root-tdd.md` records the initial failing test run and the dependency fix.
- ✅ Real code and tests were changed under the current backend API module layout: `libs/server/api/src/...` and `libs/server/api/tests/...`.
- ✅ API response remains HAL-style with `_links.self`, `_links.health`, and `_links.default-user`.
- ✅ No business rule was added to an API handler; the implementation is limited to endpoint composition and serialization.
- ✅ Domain layer remains framework-independent; no domain changes were introduced.
- ✅ Desktop and frontend surfaces were not duplicated or modified.
- ✅ `artifacts/05-code/` contains implementation notes, test results, and residual risk notes.
- ✅ Review artifact generated at `artifacts/06-reviews/review-round0.md`.

## Validation Re-run

The following commands were re-run during review:

```sh
cargo test -p evidence-server-api
cargo test -p evidence-server
cargo fmt -p evidence-server-api -- --check
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo test -p evidence-server --features postgres-tests
pnpm api:contracts
```

Results:

- ✅ `cargo test -p evidence-server-api` passed: 4 unit tests + 1 integration test.
- ✅ `cargo test -p evidence-server` passed.
- ✅ `cargo fmt -p evidence-server-api -- --check` passed.
- ✅ `cargo clippy -p evidence-server --all-targets -- -D warnings` passed.
- ✅ `cargo test -p evidence-server --features postgres-tests` passed for the `evidence-server` package target.
- ✅ `pnpm api:contracts` completed successfully, though the configured Vitest contract suite currently reports 3 skipped tests.

## Findings

### Critical

None.

### Major

None.

### Minor

1. `pnpm api:contracts` succeeds but all three configured API contract tests are skipped. This does not block US-001 because the new Rust integration test directly validates the root contract, but future API contract quality gates should consider unskipping or replacing those skipped checks.
2. The architecture artifact still contains some older examples that point to `apps/server/src/api/`, while the active workspace has split backend crates under `libs/server/api/src/`. The coding change correctly followed the active crate layout and the module-structure artifact also permits `libs/` changes, but future architecture cleanup should make the backend split explicit everywhere.

## Conclusion

Review passes. The coding phase satisfies the Definition of Done for US-001 and can proceed as complete. No Critical or Major issues block completion. Minor observations are non-blocking and should be tracked as future cleanup.
