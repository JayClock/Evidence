# Contract compatibility and HTTP acceptance

Nx project: `evidence-acceptance`; package: `@evidence-poc/evidence-acceptance`.

Consumes [`evidence-api`](../evidence-api/README.md) projections and owns:

- Compilation of top-level domain stories into a native Bruno collection.
  Each fork runs its inherited prefix and its own steps with flow-local response captures.
- Combined contract/test export (`renderDeliverables`) and atomic suite publishing.
- Execution via the pinned Bruno CLI, flow selection, regression/DoD gates and
  response-schema validation and drift reporting.
- Native `oasdiff` comparisons of final validated OpenAPI contracts.

## Entry points

| Entry         | Intended consumer                                                    |
| ------------- | -------------------------------------------------------------------- |
| root          | Node callers: renderers, combined export, contract comparison, drift |
| `/runner`     | HTTP execution and gate/report types                                 |
| `/commands`   | Typed `runDiff` for models or OpenAPI artifacts                      |
| `/projection` | Browser-safe acceptance compilation only                             |

Use `evidence export --tests` to generate just the Bruno collection.
`evidence test` runs the collection in the selected workspace's
`.evidence/acceptance/` directory.

The `/projection` entry may use `evidence-api/delivery` and the universal model
engines, but must not import the Node package root, HTTP runner or native diff.
Browser lint rules and the desktop production build exercise this boundary.

### Running the collection

A generated collection contains `bruno.json`, `environments/test.bru` and ordered
requests grouped by flow. From the collection directory, `bru run -r --env test`
(or Bruno Desktop) runs native HTTP checks. The renderer accepts single-node
JSONPaths for assertions and captures; multi-node queries are rejected.

`evidence test` additionally reads `evidence-acceptance.json`, verifies that the
native requests match the generated metadata, and executes the selected flows
sequentially in Bruno's safe sandbox. The metadata supports flow-level filters,
baseline comparison and JSON Schema 2020-12 response validation. Schema failure
blocks by default; `--detect-drift` makes it advisory and `--strict-drift` makes
it blocking again. Direct Bruno runs do not perform Evidence's schema validation
or gate selection. Keep the entire generated directory under version control.

## Setup

```bash
pnpm install
pnpm api:setup
```

Setup explicitly provisions pinned native `oasdiff` 1.38.0 under
`node_modules/.cache/evidence/oasdiff`. It verifies the release archive checksum
and executable version, and reuses a matching cached binary. It is not an install
hook. `pnpm install` provisions the pinned `@usebruno/cli`; Evidence does not use
a globally installed `bru`. No Go toolchain or Docker is needed. Rerun setup
after deleting `node_modules` or the tool cache.

`EVIDENCE_OASDIFF_BIN` takes precedence. Otherwise the runner searches from the
installed package for the provisioned cache, even if the caller's working
directory is elsewhere, then falls back to `oasdiff` on `PATH`. Missing/wrong-
version tools fail closed; comparisons never download a binary.

## Commands

```bash
pnpm exec nx build cli
pnpm evidence export
pnpm evidence export --verify
pnpm evidence test --target http://localhost:8080 --json
pnpm evidence diff /absolute/v1-workspace /absolute/v2-workspace --format json
```

`evidence-acceptance:export-tests` and `evidence-acceptance:diff` are uncached Nx
command targets that build the unified CLI first. `evidence-api:export-openapi`
exports only the aggregate contract. The root shortcuts are `pnpm evidence:diff`
and `pnpm evidence:export`.

`evidence diff` compares two workspace roots and defaults to Markdown; use
`--format json` for automation. WARN/ERR findings block the compatibility gate.
`runDiff({ base, target, format })` takes absolute paths to two model directories
or two OpenAPI JSON files of the same scope. To compare contracts generated with
overlays, pass the resulting OpenAPI files. `runDiff` returns `0` (compatible),
`1` (breaking) or `2` (invalid input or tool failure). The CLI exits nonzero
for both types of failure; check its output for the verdict and diagnostics.

Static checks and compatibility only describe the declared surface: they do not
prove that a backend implements CEL semantics, role authorization or fulfillment
behavior. Test against a real backend before claiming acceptance. Pending DoD is
not success, and a drift failure never overrides unrelated failed assertions.

## Verification

```bash
pnpm api:setup
pnpm exec nx run-many -t lint,typecheck,test -p evidence-api,evidence-acceptance,cli
```

Tests cover real HTTP servers and backend subprocesses, exact generated suites,
native contract evolution, timeout/version/tool failures, drift and both gate
policies. Acceptance tests are uncached so a missing executable cannot be hidden
by a previously passing run. API fixture builders are shared through
`evidence-api/testing` rather than copied or imported through private paths.
