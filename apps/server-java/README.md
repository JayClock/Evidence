# Evidence Java Server

This unshipped Spring Boot application is the Java replacement boundary for the
current NestJS server. It follows the Smart Domain/Jersey layout used by
`JayClock/team-ai` while preserving the existing Evidence HTTP contract.

## Implemented boundary

- `GET /health` is public.
- `GET /api` exposes the authenticated HAL root resource.
- `GET /api/openapi.json` serves the existing contract source from
  `libs/server/api/openapi.yaml`.
- Local exact-header authentication, OIDC JWT verification, CORS, host safety,
  and vendor media types are configured.
- User, Workspace, membership, and Workspace Member resources use the existing
  PostgreSQL schema through Smart Domain association objects and MyBatis XML
  mappers.
- Local startup provisions the configured user and `default-workspace`.
- Workspace creation atomically creates its owner membership and initializes a
  private `.evidence/{entities,associations}` model root.
- Diagram, Logical Entity, and Logical Relationship resources project and update
  the Workspace model files.
- Inbox capture, immutable revisions, frozen Extractions, Candidate proposals,
  terminal decisions, and Candidate admission use the existing PostgreSQL
  authority tables and cross-language SHA-256 content hashes.

The implementation follows the `JayClock/team-ai` Java conventions: immutable
Description records, model-owned wide association interfaces, lazy MyBatis
association adapters, JAX-RS subresources, `ApiTemplates`, and zero-copy HAL
representation wrappers.

## Modules

```text
apps/server-java                         Spring Boot composition root
libs/server-java/domain                  Smart Domain model
libs/server-java/application             use cases and transaction boundaries
libs/server-java/api                     Jersey/HAL adapter
libs/server-java/persistent              MyBatis/PostgreSQL and filesystem adapters
libs/server-java/infrastructure/security Spring Security adapter
```

## Commands

```sh
pnpm dev:server:java
pnpm nx run :apps:server-java:test
pnpm nx run :apps:server-java:build
```

The server listens on `127.0.0.1:3000` by default. It accepts the existing
`EVIDENCE_HOST`, `PORT`, `EVIDENCE_AUTH_MODE`, `EVIDENCE_API_AUTHORIZATION`,
`EVIDENCE_USER_ID`, `EVIDENCE_CORS_ORIGINS`, `DATABASE_URL`,
`EVIDENCE_DEFAULT_WORKSPACE_PATH`, `EVIDENCE_WORKSPACE_STORAGE_ROOT`, and
`EVIDENCE_OIDC_*` variables.
