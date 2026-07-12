# Evidence

Evidence is a domain-modeling and evidence-mapping platform. It helps teams model business domains by defining logical entities (evidence types, participants, roles, contexts) and drawing relationship diagrams with nodes and edges.

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

| Aggregate         | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| **User**          | Identity with owned workspaces                                   |
| **Workspace**     | Container for diagrams, logical entities, and members            |
| **Member**        | User-to-workspace membership with role (owner/member)            |
| **Diagram**       | Visual graph of nodes and edges                                  |
| **DiagramNode**   | Node on a diagram with type, position, style, logical-entity ref |
| **DiagramEdge**   | Edge between nodes with relation type and label                  |
| **LogicalEntity** | Typed domain concept: Evidence, Participant, Role, or Context    |

#### Logical Entity Types

| Type          | Purpose                          | Sub-types                                                                              |
| ------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| `EVIDENCE`    | Business artifacts and documents | rfp, proposal, contract, fulfillment_request, fulfillment_confirmation, other_evidence |
| `PARTICIPANT` | Actors and things in the domain  | party, thing                                                                           |
| `ROLE`        | Roles played by participants     | party, domain, 3rd system, context, evidence                                           |
| `CONTEXT`     | Bounded contexts                 | bounded_context                                                                        |

Each logical entity can carry attributes, behaviors, tags, and a human-readable definition.

### Diagram Lifecycle

Nodes and edges are managed through the diagram node and edge resources.

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

| Path                                          | Description                                         |
| --------------------------------------------- | --------------------------------------------------- |
| `/api/users/{userId}`                         | User profile                                        |
| `/api/users/{userId}/workspaces`              | List/create workspaces                              |
| `/api/users/{userId}/workspaces/{id}`         | Workspace CRUD                                      |
| `/api/users/{userId}/workspaces/{id}/members` | Workspace members                                   |
| `/api/workspaces/{id}/diagrams`               | List/create diagrams                                |
| `/api/workspaces/{id}/diagrams/{did}`         | Diagram CRUD (includes embedded nodes+edges on GET) |
| `/api/workspaces/{id}/diagrams/{did}/nodes`   | Diagram nodes                                       |
| `/api/workspaces/{id}/diagrams/{did}/edges`   | Diagram edges                                       |
| `/api/workspaces/{id}/logical-entities`       | Workspace logical entities                          |

Collections support pagination: `?page=1&pageSize=50`.

### Testing

Two persistence backends share the same contract tests:

- **Fake store** (in-memory): always runs, used for unit tests
- **PostgreSQL** (SeaORM): gated behind `#[cfg(feature = "postgres-tests")]`, requires Docker or `TEST_DATABASE_URL`

Both backends seed identical defaults: user `desktop-user` → workspace `default-workspace` with owner membership.

## Evidence 工作流

本仓库已接入一套项目本地的 Evidence 工作流。它为 Evidence 提供方法论技能、阶段提示词、命令、工具、状态文件和 Markdown 审核门，用于生成可审计的产品增量。

Pi 中可用命令：

```text
/evidence-status
/evidence-run --dry-run
/evidence-run
/evidence-gate 通过，进入下一阶段
/evidence-reset
```

工作流资产：

| 路径                                    | 用途                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `.pi/extensions/evidence-workflow/`     | Evidence 工作流状态机、审核门、命令和工具              |
| `.pi/skills/`                           | 设计思维、DDD、Scrum、TDD 和 Evidence 工作流方法论技能 |
| `.pi/prompts/`                          | 各阶段提示词模板                                       |
| `evidence-state.json`                   | 当前工作流阶段和审核门状态                             |
| `artifacts/iterations/ITER-xxxx/`       | 每轮 Evidence 工件、失败反馈和审计日志（不可覆盖）     |
| `artifacts/iterations/ITER-xxxx/gates/` | 当前迭代的类型化人工审核门                             |

建议先执行 `/evidence-status`，再执行 `/evidence-run --dry-run` 预览当前阶段。活动迭代由 `evidence-state.json` 的 `iteration_id` 指定；其种子输入位于 `artifacts/iterations/<iteration_id>/00-user-input/requirements.md`。`/evidence-reset` 会创建新 `ITER-xxxx` 命名空间并复制上一轮种子，旧工件不会被覆盖。

Gate 使用明确决策：`/evidence-gate approve <说明>` 进入下一阶段，`/evidence-gate revise <说明>` 回到被审核阶段，`/evidence-gate reject <说明>` 停止当前迭代。阶段 Check 失败会保留反馈并在同一阶段重试；达到 `max_rounds` 后创建 emergency Gate。

Coding 阶段遵循本仓库的 monorepo 边界：实现和测试必须落在所属的 `apps/*` 或 `libs/*` 项目中，不创建根级 `src/`、`tests/`。阶段完成工具会检查当前阶段、待审核 Gate 和必需输出；CI 通过 `pnpm workflow:test` 验证工作流状态迁移与代码目录发现逻辑，并通过 `pnpm workflow:validate` 验证活动迭代状态、输入和 Gate 元数据。

各阶段的模型策略配置在 `.pi/evidence-workflow.json`。`/evidence-run` 会在执行前切换模型和推理档位；模型不存在或没有凭证时会停止，而不是静默回退。当前策略为：Requirements/Domain 使用 Sol × High，Architecture/Review 使用 Sol × xHigh，Planning/Coding 使用 Terra × Medium。工作流阶段均可拆分，因此默认不使用 Max；Ultra/Pro 不是 API 推理档位，也不写入该配置。

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
