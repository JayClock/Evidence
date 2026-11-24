# API contract projection

Nx project: `evidence-api`; package: `@evidence-poc/evidence-api`.

Projects an FM model into delivery routes, service topology, OpenAPI 3.1 and HTTP
journeys, validates overlays and examples, and publishes deterministic contract
artifacts. This package does **not** generate Bruno collections, execute HTTP
acceptance, or spawn `oasdiff`. Those concerns live in
[`evidence-acceptance`](../evidence-acceptance/README.md).

## Entry points

- Root: Node projection/loading/publishing APIs such as `buildDelivery`,
  `buildProjection`, `loadModel`, `renderOutputs` and `writeOutput`.
- `/delivery`: browser-safe field/route/contract helpers, with no filesystem or
  acceptance runner imports.
- `/testing`: shared fixture builders for cross-library tests only. Fixtures
  remain in `tests/fixtures/`; consumers should not import private source paths.

The `evidence` CLI lives in `apps/cli`. For `renderDeliverables`, acceptance
renderers, `compareContracts` and `OasdiffRunner`, use `evidence-acceptance`.

## Usage

```bash
pnpm exec nx build cli
pnpm evidence export --openapi
```

The CLI exports the aggregate `openapi.json`. For the full projection, including
`services/<serviceId>/openapi.json`, topology and the manifest, use
`loadModel` / `buildProjection` and `renderOutputs` from this package. Pass the
optional pinned check report to `loadModel` and a validated overlay to
`buildProjection`; these inputs are not accepted by `evidence export`. Overlays
may adjust routes and journeys but cannot invent model semantics or hide errors.

See [API delivery](../../docs/api-projection-v6.md) for resource addresses, HAL,
logical service ownership and compatibility checks. API snapshots and
manifests use schema 7.0; FM sources still use 6.0.

## Inline examples

An entity's optional `examples` contains named **complete entity facts**, not
workflow steps. Values must satisfy its response payload schema. The projection
adds a HAL `_links.self` identity to response examples; request examples contain only
caller-owned fields, never derived values or service timestamps. Invalid examples
block export instead of being silently turned into passing tests.

Test metadata in `examples[].test` is compiled by
`evidence-acceptance/projection`, which the desktop scenario editor may import
without loading Node I/O, the HTTP runner or a native executable.

## Verification

```bash
pnpm exec nx run-many -t lint,typecheck,test -p evidence-api
pnpm boundaries:drill
```

Projection-only tests do not need `pnpm api:setup`. Native compatibility and HTTP
acceptance tests belong to `evidence-acceptance`; provision the pinned executable
before running that project's tests. Nx boundaries reject an API dependency on
the acceptance runtime.
