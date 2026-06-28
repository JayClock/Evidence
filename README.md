# Evidence

Evidence is a domain-modeling and evidence-mapping platform. It helps teams model business domains by defining logical entities (evidence types, participants, roles, contexts), drawing relationship diagrams with nodes and edges, and snapshotting versions over time.

Two runtime surfaces, one frontend:

- **Web**: React + Vite SPA served by the Axum backend
- **Desktop**: Tauri 2 shell that loads the same `apps/web` frontend

[AGENTS.md](./AGENTS.md) · Architecture (below) · [Quick Start](#quick-start) · [Contributing](#contributing)

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web                     React + Vite (port 4200)      │
│  └─ main.tsx → App.tsx        react-router-dom routes       │
├─────────────────────────────────────────────────────────────┤
│  apps/desktop                 Tauri 2 shell                 │
│  └─ src-tauri/                Wraps apps/web in dev/build   │
├─────────────────────────────────────────────────────────────┤
│  apps/server                  Rust Axum (port 3000)         │
│  ├─ api/                      REST routes, HAL JSON         │
│  ├─ domain/                   Pure traits + aggregates      │
│  └─ persistent/               SeaORM + PostgreSQL           │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL                   Persistence                   │
└─────────────────────────────────────────────────────────────┘
```

The web and desktop surfaces share the same React frontend (`apps/web`). In dev mode, Tauri starts the Vite dev server and opens it in a native window. In build mode, Tauri bundles `apps/web/dist` as its frontend.

### Domain Model

| Aggregate          | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| **User**           | Identity with owned workspaces                                                 |
| **Workspace**      | Container for diagrams, logical entities, and members                          |
| **Member**         | User-to-workspace membership with role (owner/member)                          |
| **Diagram**        | Visual graph of nodes and edges, with version snapshots                        |
| **DiagramNode**    | Node on a diagram with type, position, style, logical-entity ref               |
| **DiagramEdge**    | Edge between nodes with relation type and label                                |
| **DiagramVersion** | Immutable snapshot capturing all nodes, edges, and viewport at a point in time |
| **LogicalEntity**  | Typed domain concept: Evidence, Participant, Role, or Context                  |

#### Logical Entity Types

| Type          | Purpose                          | Sub-types                                                                              |
| ------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| `EVIDENCE`    | Business artifacts and documents | rfp, proposal, contract, fulfillment_request, fulfillment_confirmation, other_evidence |
| `PARTICIPANT` | Actors and things in the domain  | party, thing                                                                           |
| `ROLE`        | Roles played by participants     | party, domain, 3rd system, context, evidence                                           |
| `CONTEXT`     | Bounded contexts                 | bounded_context                                                                        |

Each logical entity can carry attributes, behaviors, tags, and a human-readable definition.

### Diagram Lifecycle

Nodes and edges are added individually or in bulk via `commit-draft`. Snapshots are created via `create-version` — the system captures all current nodes, edges, and the viewport at that moment.

### API

The API follows HAL (Hypertext Application Language) conventions: all resources contain `_links` for navigation and `_embedded` for child resources.

**Root entry point:**

```
GET /api
{
  "_links": {
    "self": { "href": "/api" },
    "health": { "href": "/health" },
    "default-user": { "href": "/api/users/desktop-user" }
  }
}
```

**Key resource paths:**

| Path                                               | Description                                         |
| -------------------------------------------------- | --------------------------------------------------- |
| `/api/users/{userId}`                              | User profile                                        |
| `/api/users/{userId}/workspaces`                   | List/create workspaces                              |
| `/api/users/{userId}/workspaces/{id}`              | Workspace CRUD                                      |
| `/api/users/{userId}/workspaces/{id}/members`      | Workspace members                                   |
| `/api/workspaces/{id}/diagrams`                    | List/create diagrams                                |
| `/api/workspaces/{id}/diagrams/{did}`              | Diagram CRUD (includes embedded nodes+edges on GET) |
| `/api/workspaces/{id}/diagrams/{did}/nodes`        | Diagram nodes                                       |
| `/api/workspaces/{id}/diagrams/{did}/edges`        | Diagram edges                                       |
| `/api/workspaces/{id}/diagrams/{did}/versions`     | Diagram version snapshots                           |
| `/api/workspaces/{id}/diagrams/{did}/commit-draft` | Save draft nodes+edges                              |
| `/api/workspaces/{id}/logical-entities`            | Workspace logical entities                          |

Collections support pagination: `?page=1&pageSize=50`.

### Testing

Two persistence backends share the same contract tests:

- **Fake store** (in-memory): always runs, used for unit tests
- **PostgreSQL** (SeaORM): gated behind `#[cfg(feature = "postgres-tests")]`, requires Docker or `TEST_DATABASE_URL`

Both backends seed identical defaults: user `desktop-user` → workspace `default-workspace` with owner membership.

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- Rust toolchain (`cargo`, `rustc`)
- Tauri system dependencies: https://tauri.app/start/prerequisites/
- PostgreSQL (for the backend)

### Install

```sh
pnpm install
```

### Web (browser-first)

```sh
# Start backend (requires DATABASE_URL or PGSQL_DATABASE_URL)
DATABASE_URL=postgres://localhost/evidence pnpm dev:server

# Start frontend
pnpm dev:web
```

Open `http://localhost:4200`.

### Desktop (local-first)

```sh
# Start everything with one command (backend + frontend + Tauri shell)
pnpm dev:desktop
```

Tauri smoke path: `http://127.0.0.1:4200` served inside the native window. Backend runs on `http://127.0.0.1:3000`.

### Server only

```sh
DATABASE_URL=postgres://localhost/evidence cargo run -p evidence-server
curl http://127.0.0.1:3000/health
```

Environment variables:

| Variable             | Default          | Description                          |
| -------------------- | ---------------- | ------------------------------------ |
| `DATABASE_URL`       | (required)       | PostgreSQL connection string         |
| `PGSQL_DATABASE_URL` | (fallback)       | Alternative PostgreSQL variable name |
| `API_ADDR`           | `127.0.0.1:3000` | Listen address                       |

## Common Commands

```sh
# List projects
pnpm nx show projects

# Quality gates (all projects)
pnpm lint
pnpm test
pnpm typecheck

# Frontend-only
pnpm nx build @evidence/web
pnpm nx test @evidence/web --run

# Backend-only
pnpm nx build @evidence/server
pnpm nx test @evidence/server
pnpm nx lint @evidence/server        # cargo clippy

# Desktop-only
pnpm nx build @evidence/desktop
pnpm nx test @evidence/desktop

# Full platform bundle (e.g., DMG on macOS)
# pnpm --dir apps/desktop tauri build --bundles dmg
```

## Validation

```sh
# All projects
pnpm lint              # ESLint (frontend) + cargo clippy (Rust)
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest (frontend) + cargo test (Rust)

# PostgreSQL integration tests
cargo test -p evidence-server --features postgres-tests
```

## Repository Map

| Path                                         | Purpose                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| `apps/web/`                                  | React + Vite frontend SPA                                      |
| `apps/server/src/api/`                       | Axum HTTP routes and HAL response builders                     |
| `apps/server/src/domain/`                    | Pure domain traits and aggregates                              |
| `apps/server/src/domain/core/`               | `Entity`, `HasMany`, `Ref` base abstractions                   |
| `apps/server/src/persistent/`                | SeaORM + PostgreSQL implementations                            |
| `apps/server/src/persistent/test_support.rs` | In-memory fake store + shared contract tests                   |
| `apps/desktop/`                              | Tauri 2 desktop shell                                          |
| `apps/desktop/src-tauri/`                    | Tauri Rust config and capabilities                             |
| `Cargo.toml`                                 | Rust workspace root                                            |
| `nx.json`                                    | Nx workspace configuration                                     |
| `pnpm-workspace.yaml`                        | pnpm workspace (packages: `apps/*`)                            |
| `AGENTS.md`                                  | Agent coding standards, domain guide, repo map, git discipline |

## Desktop/Web Relationship

`apps/desktop/src-tauri/tauri.conf.json` orchestrates the frontend:

- **dev**: starts Vite dev server on `http://127.0.0.1:4200`, opens in Tauri window
- **build**: runs `pnpm nx build @evidence/web` to produce `apps/web/dist`
- **bundle**: uses `apps/web/dist` as Tauri `frontendDist`

`apps/web` is the only frontend source. The desktop has no separate React app.

## Git Hooks and Commits

This repository uses Husky, lint-staged, and commitlint.

- **pre-commit**: formats + lints staged JS/TS/JSON/CSS/MD files; formats staged Rust/TOML files
- **commit-msg**: validates Conventional Commits

```
<type>(<scope>): <subject>

# Examples:
feat(web): add diagram viewer page
fix(server): handle empty viewport on diagram create
chore(workspace): upgrade nx to latest
```

Allowed scopes: `web`, `desktop`, `server`, `workspace`, `deps`, `ci`, `docs`, `release`.

## License

MIT.
