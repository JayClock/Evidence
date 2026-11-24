# API delivery (FM v6, projection v7)

FM source documents still use schema version 6.0. The API snapshot and export
manifest use 7.0. The generated contract uses OpenAPI 3.1 with the business
model's version in `info.version` and `x-evidence-model-version`.

## Business resource addresses

Public paths start at the aggregate's business noun, derived from its entity ID.
A Context supplies a logical service owner, never a deployment-specific URI prefix.

| Resource             | Creation                  | Primary GET                                      |
| -------------------- | ------------------------- | ------------------------------------------------ |
| Inquiry              | `/product-inquiries`      | `/product-inquiries/{inquiryId}`                 |
| Contract             | `/product-procurements`   | `/product-procurements/{contractId}`             |
| Singleton payment    | `…/{contractId}/payment`  | same path                                        |
| Repeated payment     | `…/{contractId}/payments` | `…/{contractId}/payments/{paymentId}`            |
| Payment confirmation | `…/payment/confirmation`  | `/payment-confirmations/{paymentConfirmationId}` |
| Domain root          | read only                 | `/products/{productId}`                          |

The child endpoint's `references` cardinality determines singleton versus
collection, whichever direction the relationship points. Missing or contradictory
cardinalities imply a collection. The full-lifecycle fixture declares singleton
quotations and payments; changing a child's maximum to `many` produces the plural
collection and its instance parameter. Collection GETs accompany collection
creation. A confirmation's creation entrance and authority are independent:

- **Exclusive singleton:** POST at the request item's `/confirmation` action.
- **Exclusive collection:** POST to the confirmation collection under the request
  item, or under the contract item when the request is itself a singleton. A GET
  on the same collection is a ledger view, not the authority for each item.
- **Shared:** one top-level POST accepts a `request_ids` array of request instance
  IDs. Each request item exposes a reverse collection GET at
  `…/{request-item}/{confirmation-plural}`; it does not expose another POST.

All confirmations have a top-level primary GET at
`/{confirmation-plural}/{confirmation-id}`. Clients should follow the `201 Location`
header or HAL `self` instead of constructing a detail URI from the write entrance.

Proposals nest under the inquiry they reference. A contract referencing a proposal
also gets a signing operation under that proposal's primary URI, served by the
contract service. Both signing entrances return the same new contract primary URI.
Independent `other_evidence` with a modeled `id` value type gets a top-level
read-only collection and primary GET. Other supporting evidence is not assumed to
have a globally addressable identity.

Names are allocated globally among public roots and locally among child siblings.
Same-name roots receive deterministic identity suffixes. Allocation does not depend
on enumeration order, scoped export, Context names or unrelated roles. Creating a
new root that actually collides with an existing business name is a contract
change and should be checked with `evidence diff`.

## HAL and caller discipline

Every POST's 201 `Location` and `_links.self` identify a GET operation. A collection
GET returns `_links.self`, `_embedded.<business-collection>` summaries with their
own primary links, and a nonnegative `total`. Entity and collection schemas are
separate OpenAPI components. Reference edges produce templated `next:<entityRef>`
links. Confirmation items can link back to requests via `request:<requestRef>`;
request items can link to shared-confirmation collections via
`confirmations:<confirmationRef>`. These are contract templates, not claims that
an instance is ready, associated, or authorized at runtime.

A modeled breach yields a compensation creation entrance beneath the original
request and a separate canonical resource URI for later reads and confirmations.
A typed escalation yields a hand-off record, not a filing with a court or
arbitrator. Conditional branch templates carry their relationship identity and
are omitted from generic example responses. To render actual affordances use
`resolveRuntimeHalLinks` with the service's decisions for this caller, condition
and resource instance. Unknown conditions or missing URI bindings do not produce
links. Write handlers must recheck eligibility. Executable examples for an
exception command must name the breached request example (in `basedOn` or as a
path-parameter source); the compiler refuses ambiguous branches.

Only caller-owned attributes appear in POST input, with
`additionalProperties: false`. Derived and service-time response fields are
`readOnly`; derivations retain their rule references. Contract callers must play
`role.party` through `participant.party`. A fulfillment confirmation can also
explicitly delegate its POST with `callbackRoleRefs`: each entry names a local
`role.third_party` played by a `participant.party`. These delegates do not own the
obligation or gain GET access. OpenAPI exposes them separately in
`x-evidence-allowed-callback-roles`; the actual service must authenticate and
authorize the caller.

An overlay can move a creation entrance independently of its primary GET. Moving
the primary GET updates all corresponding creation `Location` and self templates.
Overlays must retain the operation's identity parameters; collisions are errors.

## Asynchronous fulfillment requests

`asyncAcceptance: true` applies only to a `fulfillment_request`. Its POST returns
`202 Accepted`, not `201`, with `Location` and HAL `self` indicating the request
item to poll. The request records **acceptance**, not completion. A later
confirmation POST still returns `201` and its own canonical URI. The request's GET
advertises a `result:<confirmationRef>` link template; the service should expose a
concrete result link only once the result exists. The contract projects read
access to that local result for the bound requesting role, not permission to
record it. The service must still check the request–result instance association.

## Service ownership and delivery

A service has `routePrefixes` and `routes` (exact route IDs). Topology, OpenAPI
service extensions, desktop previews and MCP return the same ownership. A contract
service may own a proposal-signing URI under the channel's business root, so a
prefix alone is not sufficient to decide ownership.

`evidence export --openapi` exports the aggregate `openapi.json`. For standalone
`services/<serviceId>/openapi.json`, `topology.json` and projection artifacts, use
`renderOutputs` from `@evidence-poc/evidence-api`; there is no `evidence` CLI
replacement for the full projection export. Each operation appears unchanged in
exactly one service view, including its hypermedia templates to other services.
`topology.json` describes modeled subject references, signing and capability
outcomes; it does not prescribe containers, transports or runtime dependencies.
There is no generated Compose or broker configuration.

Save published contracts outside the generated directory. Compare a candidate
with the corresponding published contract before release:

```bash
pnpm evidence diff published/procurement/openapi.json \
  dist/api/services/service.product-procurement/openapi.json --format markdown
```

Compare two model inputs or two OpenAPI JSON artifacts of the same scope. The
CLI exits nonzero for either breaking changes or an invalid comparison. Callers
that need distinct codes (`1` for breaking changes, `2` for input or tool errors)
can use the typed `runDiff` API in `@evidence-poc/evidence-acceptance`. `oasdiff`
checks the declared interface; behavior still needs tests and release policy.

## Automatic API draft sync

The desktop automatically syncs the current editor revision after 500 ms without
new model edits. It uses unsaved changes as well as saved changes. There is no
export button or directory picker. The same public URI rules apply whether the
implementation will be a monolith or use multiple deployment units.

- Draft output is fixed at `<projectRoot>/.evidence/delivery/`. The old root-level output and `.evidencerc.json` are not used.
- A business Context is the unit of validation and sync. Contract files contain
  the exact operations owned by that Context, not everything under a URI prefix.
  A blocked Context's existing `services/<contextId>/` files are retained.
  Contexts with required HTTP dependencies in blocked scopes also wait; optional
  navigation to excluded routes is not emitted.
- The generated `openapi.json` includes only the currently ready subset and is
  marked `x-evidence-delivery-state: partial` when there are blockers. On recovery
  it automatically includes the repaired Context. An ambiguous model-level
  failure, such as duplicate IDs, leaves the previous output intact.
- `delivery-status.json` records the model digest, included/blocked/empty
  contexts, and the gateway digest. Context manifests record their file digests.
  Files are replaced atomically one by one, with the context manifest and status
  placed last. Consumers that need a consistent multi-file read should verify
  the digests and retry on mismatch. No history or backup is generated.

For the equivalent **saved-model** CLI workflow:

```bash
pnpm evidence export --only-unblocked
pnpm evidence export --only-unblocked --verify
pnpm evidence export --watch
```

Desktop sync and CLI `--watch` write the same draft paths; run only one for a workspace at a time. Full export instead writes `delivery/release/openapi.json` and `acceptance/` under `.evidence`. Draft sync is not a release compatibility gate.

## Overlay migration

Place the input at `.evidence/overlays/legacy.json` and run `evidence migrate-overlay` from the workspace. The result is `.evidence/overlays/api-v6.json`.

Migration reads the model because old paths alone do not express cardinality.
It recognizes v5 defaults, projects their v6 paths, upgrades obsolete singleton
ledger route IDs and journey references, and preserves custom aliases and
summaries where their parameters remain valid. Unknown routes and ambiguous
parameter changes fail for manual review. Output must be a new file; source
files are never overwritten. Both 5.0 and 6.0 overlay envelopes are readable;
newly migrated overlays declare 6.0. Use migrated overlays with the projection
library; `evidence export` and `evidence diff` do not take overlay arguments.

## Verification and generated documents

```bash
pnpm api:setup
pnpm example:setup
pnpm example:test
pnpm boundaries:drill
pnpm exec nx run-many -t lint,typecheck,test
pnpm nx build cli
pnpm evidence export --workspace examples/b2b-escrow --verify
pnpm examples:verify
```

Use Node 22 as described in ENVIRONMENT.md. The standalone Fastify SUT implements
the v6 contract; its native tests follow created primary URIs and inspect HAL
collections. Evidence runs generated flows with the pinned Bruno CLI and uses
actual HTTP responses for schema validation. The acceptance tests exercise
independently broken amounts, clocks and payloads, and chained response
captures, including proposal signing.

The [digital advertising](../examples/digital-advertising/README.md),
[agile sprint](../examples/agile-sprint/README.md), and
[shared settlement](../examples/shared-settlement/README.md) examples cover
single confirmation, append-only confirmation, shared confirmation, and the
negotiation-to-asynchronous-result lifecycle. Each is a standalone model plus
compiled OpenAPI and a Bruno collection, not a service implementation. CI runs
`pnpm examples:verify` to check their models and compare the generated files
without writing them. `pnpm boundaries:drill` remains the module-boundary test.

The canonical confirmation paths are an approved breaking change. For B2B escrow,
comparing the previously committed OpenAPI to the regenerated artifact with
`oasdiff breaking` reports 13 removed nested GET operations. The corresponding
POSTs keep their action paths; clients must switch to the new `Location`/HAL `self`
URI for reads. Git model baselines remain immutable; rerunning the current
projector on both models measures model evolution, not this projector migration.

OpenWiki is maintained through the pinned OpenWiki 0.9.0 generation lifecycle or
`.github/workflows/openwiki-update.yml`; the workflow currently requires manual
triggering. Changes to Markdown pages and their Claim credentials are finalized
by OpenWiki together, rather than by changing evidence hashes manually.
