# Evidence Java Server Skeleton

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

The PostgreSQL and filesystem adapters are intentionally not wired into the
application yet. Their Gradle modules are placeholders for the next vertical
slice. OIDC validates issuer and audience, but its subject-to-internal-user
mapping and auto-provisioning remain part of that persistence slice.

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
`EVIDENCE_USER_ID`, `EVIDENCE_CORS_ORIGINS`, and `EVIDENCE_OIDC_*` variables.
