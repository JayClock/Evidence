Evidence is a domain-modeling and evidence-mapping platform with three runtime surfaces:

- **Web**: React + Vite SPA in `apps/web/`
- **Server**: Rust Axum backend in `apps/server/`
- **Desktop**: Tauri 2 desktop shell in `apps/desktop/` that loads/builds `apps/web`

The project is intentionally not "two separate products". Web and Desktop differ in deployment model (SPA served by Axum vs Tauri shell), but they share the same React frontend, the same REST API, and the same domain semantics.

## Architecture Overview

```
apps/web/                  React + Vite frontend (port 4200)
    ↓ HTTP
apps/server/               Rust Axum backend (port 3000)
    ↓ SeaORM
PostgreSQL                 Persistence layer
```

Desktop mode wraps `apps/web` inside a Tauri shell:
- **dev**: Tauri starts `apps/web` on `http://127.0.0.1:4200` and opens it
- **build**: Tauri runs `pnpm nx build @evidence/web` and bundles `apps/web/dist`

### Domain Model

The backend uses a layered, trait-driven architecture:

| Layer | Path | Role |
|-------|------|------|
| API | `apps/server/src/api/` | Axum routes, request parsing, HAL-style JSON responses with `_links` |
| Domain | `apps/server/src/domain/` | Pure domain traits (`Entity`, `HasMany`, `Users`, `WorkspaceMembers`, etc.) — no persistence |
| Persistent | `apps/server/src/persistent/` | SeaORM + PostgreSQL implementation of domain traits |

#### Core Abstractions (`src/domain/core/`)

- **`Entity`**: trait with `identity()` → `&Self::Identity` and `description()` → `&Self::Description`
- **`HasMany<T>`**: trait for child collections — `find_all(from, to)`, `find_by_identity(id)`, `size()`
- **`Ref<T>`**: typed reference wrapper for cross-entity relationships

#### Domain Aggregates

| Aggregate | Path | Description |
|-----------|------|-------------|
| `User` | `domain/user.rs` | User identity + `UserWorkspaces` children |
| `Workspace` | `domain/workspace.rs` | Container with `WorkspaceMembers`, `WorkspaceDiagrams`, `WorkspaceLogicalEntities` |
| `Member` | `domain/member.rs` | Workspace membership (user reference + role) |
| `Diagram` | `domain/diagram/` | Visual diagram with `DiagramNodes`, `DiagramEdges`, `DiagramVersions`, supporting Draft/Publish flow |
| `DiagramNode` | `domain/diagram/node.rs` | Node on a diagram (type, position, logical-entity ref, style) |
| `DiagramEdge` | `domain/diagram/edge.rs` | Edge between nodes (source/target, relation type, label) |
| `DiagramVersion` | `domain/diagram/version.rs` | Immutable snapshot of diagram state |
| `LogicalEntity` | `domain/logical_entity.rs` | Typed entity: Evidence, Participant, Role, or Context — with attributes, behaviors, sub-types |

#### Logical Entity Types

| Type | Sub-types |
|------|-----------|
| `EVIDENCE` | rfp, proposal, contract, fulfillment_request, fulfillment_confirmation, other_evidence |
| `PARTICIPANT` | party, thing |
| `ROLE` | party, domain, 3rd system, context, evidence |
| `CONTEXT` | bounded_context |

### API Design

The API follows HAL-style conventions:
- All resources include `_links` with `self`, `collection`, and related resource links
- Collections use `_embedded` for child resources and `page` for pagination metadata
- Pagination uses `page` and `pageSize` query parameters

#### API Routes

| Route | Methods | Description |
|-------|---------|-------------|
| `/api` | GET | Root resource with links to health, default-user |
| `/health` | GET | Health check |
| `/api/users/{userId}` | GET | User resource |
| `/api/users/{userId}/workspaces` | GET, POST | List/create workspaces |
| `/api/users/{userId}/workspaces/{id}` | GET, PUT, DELETE | CRUD workspace |
| `/api/users/{userId}/workspaces/{id}/members` | GET, POST | List/add members |
| `/api/users/{userId}/workspaces/{id}/members/{mid}` | DELETE | Remove member |
| `/api/workspaces/{id}/diagrams` | GET, POST | List/create diagrams |
| `/api/workspaces/{id}/diagrams/{did}` | GET, PUT, DELETE | CRUD diagram |
| `/api/workspaces/{id}/diagrams/{did}/nodes` | GET, POST | List/create nodes |
| `/api/workspaces/{id}/diagrams/{did}/nodes/{nid}` | GET, PUT, DELETE | CRUD node |
| `/api/workspaces/{id}/diagrams/{did}/edges` | GET, POST | List/create edges |
| `/api/workspaces/{id}/diagrams/{did}/edges/{eid}` | GET, PUT, DELETE | CRUD edge |
| `/api/workspaces/{id}/diagrams/{did}/versions` | GET, POST | List/create snapshots |
| `/api/workspaces/{id}/diagrams/{did}/commit-draft` | POST | Save draft nodes+edges |
| `/api/workspaces/{id}/diagrams/{did}/publish` | POST | Publish diagram |
| `/api/workspaces/{id}/logical-entities` | GET, POST | List/create logical entities |
| `/api/workspaces/{id}/logical-entities/{eid}` | GET, PUT, DELETE | CRUD logical entity |

### Testing Strategy

Two persistence implementations share the same **contract tests**:

1. **Fake store** (`FakeUsers` in `persistent/test_support.rs`) — in-memory, runs always
2. **PostgreSQL** (`PgUsers` in `persistent/users.rs`) — runs behind `#[cfg(feature = "postgres-tests")]`, requires Docker or `TEST_DATABASE_URL`

Contract tests are defined in `persistent/test_support.rs::contracts` and exercised by both implementations:
- `user_sees_seed_workspace`
- `creating_workspace_adds_owner_member`
- `duplicate_member_is_conflict`
- `workspace_logical_entities_crud`

Both implementations seed the same defaults: `desktop-user` → `default-workspace`.

## Coding Standards

### TypeScript (Frontend)

- `apps/web` is the single frontend source. All React components live here.
- Use `react-router-dom` for routing. Current routes are scaffold only, replace with domain-specific views.
- Nx plugin `@nx/vite` handles build/test/serve/dev/preview targets — do not manually configure Vite targets in `project.json`.
- Nx plugin `@nx/vitest` handles test targets — test files match `{src,tests}/**/*.{test,spec}.*`.
- Vite dev server runs on `http://127.0.0.1:4200` (configured in `apps/web/vite.config.mts`).
- Tauri dev starts the Vite dev server as `beforeDevCommand` — the desktop shell must be developed alongside the web frontend.

### Rust (Backend)

- **Domain traits first**: define behavior as `async_trait` traits in `domain/` before implementing in `persistent/`.
- **No business logic in API handlers**: handlers should parse, delegate to domain, and serialize. All business rules live in `domain/`.
- **Use the `Entity` + `HasMany` pattern**: every aggregate implements `Entity`; child collections implement `HasMany<T>`. The `_wide()` suffix methods return the narrowest trait needed (e.g., `members_wide()` → `&dyn WorkspaceMembers` for adding/removing, `members()` → `&dyn HasMany<Member>` for reading).
- **Error handling**: use `domain::ServerError` with `NotFound`, `Validation`, `Conflict`, and `Internal` variants. Map SeaORM `DbErr` through `persistent::store::db_error()`.
- **Timestamp format**: all timestamps use RFC 3339 (`Utc::now().to_rfc3339()`).
- **Soft deletes**: `deleted_at` column with `Option<String>`, filtered in all queries.
- When adding a new persistent entity:
  1. Define domain traits in `domain/`
  2. Create SeaORM entity in `persistent/entities/`
  3. Implement the trait in `persistent/` (end with `_test` module for `#[cfg(test)]` fast tests)
  4. Add contract tests in `persistent/test_support.rs::contracts`
  5. Register table + indexes in `persistent/store.rs::init_schema()`
  6. Wire into `FakeStore` for fast tests and `PgStore` for integration tests
- For long handler files (`api/diagrams.rs` is ~500 lines), prefer extracting resource serialization helpers into a separate module before splitting routes.

### Desktop (Tauri)

- `apps/desktop/project.json` declares `implicitDependencies: ["@evidence/web"]` — the desktop always depends on the web frontend.
- `apps/desktop/src-tauri/tauri.conf.json` is the single source of truth for dev/build/bundle configuration.
- Desktop uses `cargo build -p evidence-desktop` / `cargo test -p evidence-desktop` / `cargo clippy -p evidence-desktop` via Nx executors.
- Tauri uses capability-based permissions (`capabilities/default.json`) — currently `core:default` + `opener:default`.

### Git Hooks and Commit Messages

- **pre-commit**: `lint-staged` formats staged files with `nx format:write`, lints JS/TS with ESLint, formats Rust/TOML with `cargo fmt --all`.
- **commit-msg**: validates Conventional Commits via `@commitlint/config-conventional`.

Commit format:
```
<type>(<scope>): <subject>
```

Allowed scopes: `web`, `desktop`, `server`, `workspace`, `deps`, `ci`, `docs`, `release`.

## Repository Map

| Path | Purpose |
|------|---------|
| `apps/web/` | React + Vite frontend SPA |
| `apps/server/src/api/` | Axum HTTP routes and HAL response builders |
| `apps/server/src/domain/` | Pure domain traits and aggregates (no framework dep) |
| `apps/server/src/domain/core/` | `Entity`, `HasMany`, `Ref` base abstractions |
| `apps/server/src/persistent/` | SeaORM + PostgreSQL implementations |
| `apps/server/src/persistent/entities/` | SeaORM entity model definitions |
| `apps/server/src/persistent/test_support.rs` | In-memory `FakeUsers` + reusable contract tests |
| `apps/desktop/` | Tauri 2 desktop shell |
| `apps/desktop/src-tauri/` | Tauri Rust crate, config, and capabilities |
| `Cargo.toml` | Rust workspace (members: `apps/server`, `apps/desktop/src-tauri`) |
| `nx.json` | Nx workspace config and plugin registry |
| `pnpm-workspace.yaml` | pnpm workspace config (`apps/*`) |
| `package.json` | Root scripts and shared devDependencies |
| `tsconfig.base.json` | Shared TypeScript base config |
| `vitest.workspace.ts` | Vitest workspace file discovery |
| `eslint.config.mjs` | Root ESLint flat config with Nx module boundary rules |
| `commitlint.config.cjs` | Conventional commit rules and scope whitelist |
| `lint-staged.config.mjs` | Pre-commit formatting and linting |
| `.husky/` | Git hooks (pre-commit, commit-msg) |

## Validation

Before PR, run quality gates:

```sh
# Frontend
pnpm lint
pnpm typecheck
pnpm test

# Backend
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo test -p evidence-server
cargo fmt -p evidence-server -- --check

# Desktop
cargo clippy -p evidence-desktop --all-targets -- -D warnings
cargo test -p evidence-desktop
cargo fmt -p evidence-desktop -- --check
```

For PostgreSQL integration tests:
```sh
cargo test -p evidence-server --features postgres-tests
```

If a check fails, fix and re-run; do not skip.

## Git Discipline

- One commit = one concern (feature, fix, or refactor) with Conventional Commits format.
- No kitchen-sink commits; split mixed concerns.
- Target budget: under 10 files and under 1000 changed lines per commit.
- Include related GitHub issue ID when applicable.

## Reading Order

When starting work on this repository, read in this order:

1. This file (`AGENTS.md`) — runtime topology and boundaries.
2. `apps/server/src/main.rs` — server startup, config, graceful shutdown.
3. `apps/server/src/domain/mod.rs` — domain aggregate re-exports.
4. `apps/server/src/api/mod.rs` — route registration and middleware.
5. `apps/server/src/persistent/store.rs` — schema initialization and seed data.
6. `apps/server/src/persistent/test_support.rs` — contract tests to understand expected behavior.
7. `apps/desktop/src-tauri/tauri.conf.json` — desktop/web boundary configuration.
