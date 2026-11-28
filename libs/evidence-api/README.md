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
manifests and FM sources both use schema 7.0.

## Story facts in OpenAPI and Bruno

Successful story steps supply OpenAPI examples for their `workObjectRef`.
Response examples include a HAL `_links.self` identity. Request examples include
the caller-owned fields. The exporter validates example payloads against the
projected contract.

`evidence-acceptance/projection` expands each story’s `forkedFrom` prefix and
compiles its HTTP steps, including declared rejections. The desktop scenario
editor uses the same projection to preview a story’s acceptance flow.

## Verification

```bash
pnpm exec nx run-many -t lint,typecheck,test -p evidence-api
pnpm boundaries:drill
```

Projection-only tests do not need `pnpm api:setup`. Native compatibility and HTTP
acceptance tests belong to `evidence-acceptance`; provision the pinned executable
before running that project's tests. Nx boundaries reject an API dependency on
the acceptance runtime.
