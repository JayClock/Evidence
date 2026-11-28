# evidence-schema

Typed contracts for Fulfillment Modeling (FM) v7 sources, shared by the desktop
client, the model core and the MCP tools.

- `ast/` — entity, relationship, rule, story and document types with narrow guards,
  mirroring `schemas/*.json` field for field. Those JSON Schemas ship beside the
  code as the published contract; the types are the executable form of them.
- `validation/` — `strictValidateDomainModel` holds the static FM checks (ids,
  category contracts, context ownership, responsibility, relationship endpoints,
  derivation symmetry, story lineage and step references). Traceability, key-data providers, scope completeness and
  CEL evaluation are separate passes in `evidence-model-core` and `evidence-cel`.
  The desktop inspector owns its group, editor and reference-picker metadata.

Each story file declares its own steps. A local step ID refers to the story
that authored the reference. Use `storyId#stepId` to reference an inherited
step through the parent’s `forkedFrom` anchor.

```bash
nx build evidence-schema
nx test evidence-schema
```

`tests/fixtures/product-procurement/` is a snapshot of a real FM model source
tree; validator tests mutate clones of it instead of editing fixtures.
