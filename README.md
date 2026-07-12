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
│  apps/web + libs/web/*        React + Vite (port 4200)      │
│  └─ composition + features    shared Web product            │
├─────────────────────────────────────────────────────────────┤
│  apps/desktop                 Tauri 2 shell                 │
│  └─ src-tauri/                Wraps apps/web in dev/build   │
├─────────────────────────────────────────────────────────────┤
│  apps/server + libs/server/*  Rust Axum track (port 3000)   │
│  └─ api/domain/persistent     modular implementation        │
├─────────────────────────────────────────────────────────────┤
│  apps/server-nest + libs/server-nest/*  Nest track          │
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

## Evidence Orchestrator

本仓库已接入项目本地的 Evidence Orchestrator。它通过独立阶段 subagent、确定性命令与工具、状态文件和 Markdown 审核门编排可审计的产品增量。

Pi 中可用命令：

```text
/evidence-status
/evidence-reset --issue=123 [--repo=owner/evidence]
/evidence-issue-status
/evidence-issue-sync
/evidence-run --dry-run
/evidence-run
/evidence-gate 通过，进入下一阶段
/evidence-answer <领域专家的回答>

# Coding phase tool
# evidence_orchestrator_run_test_step(processId, stage, command)
```

工作流资产：

| 路径                                    | 用途                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| `docs/product/`                         | 跨迭代统一维护的产品画像、业务上下文、旅程和故事地图    |
| `.evidence/`                            | 跨迭代权威领域模型                                      |
| `docs/architecture/`                    | 跨迭代统一维护的架构与测试策略                          |
| `contracts/`                            | 可执行 API 契约                                         |
| `engineering/evidence-orchestrator/`    | 功能上下文、测试工序目录和统一 DoD                      |
| `.pi/extensions/evidence-orchestrator/` | 工作流状态机、审核门、命令、工具与 subagent 执行器      |
| `.pi/agents/`                           | 隔离上下文的阶段角色、模型、推理档位和工具权限          |
| `evidence-state.json`                   | 当前工作流阶段和审核门状态                              |
| `artifacts/iterations/ITER-xxxx/`       | 单轮输入、切片、delta、决策、执行证据和反馈（不可覆盖） |
| `artifacts/iterations/ITER-xxxx/gates/` | 当前迭代的类型化人工审核门                              |

使用 `/evidence-reset --issue=123 [--repo=owner/evidence]` 从 GitHub Issue 创建新迭代。Issue 是需求权威来源；工作流将其冻结为 `00-user-input/issue.json`，并自动生成只读的 `requirements.md` 投影供 Frame 使用，禁止手工维护该文件。没有 GitHub Issue source 的 bootstrap iteration 只作为历史记录，不能执行；活动迭代由 `evidence-state.json` 的 `iteration_id` 指定，旧工件不会被覆盖。

`/evidence-issue-status` 检查远端 Issue 是否偏离当前快照。只有仍在 Frame 时才能执行 `/evidence-issue-sync` 显式刷新；Frame 之后的需求变化应开启新迭代，以免破坏 Story、Scenario 和模型展开的输入基线。

Gate 使用明确决策：`/evidence-gate approve <说明>` 进入下一阶段，`/evidence-gate revise <说明>` 回到被审核阶段，`/evidence-gate reject <说明>` 停止当前迭代。阶段 Check 失败会保留反馈并在同一阶段重试；达到 `max_rounds` 后创建 emergency Gate。

`frame` 先读取 `docs/product/` 的统一产品知识，只在 iteration 输出问题陈述、上下文增量、旅程切片和故事地图增量。`clarify` 使用 TQA：业务上下文回答先追加到 `product-context-delta.md`，不得直接改写统一产品知识；经 Learn/Gate 确认后才提升到 `docs/product/`。未回答问题会阻止故事进入 Ready 和下一阶段。

`architecture` 读取 `docs/architecture/`、`contracts/` 和 `engineering/evidence-orchestrator/`，iteration 只输出架构决策、API/data delta 和机器可读 `scenario-context-map.json`。项目级目录维护 Rust、Web、Nest 和 Tauri 工序；Coding 选择工序时快照到本轮 `selected-test-processes/`。一个垂直场景可顺序选择多个 runtime 工序并在 `test_plan` 中固定组合。GitHub Issues/Projects 是 Product Backlog 权威来源，统一 DoD 位于 `engineering/evidence-orchestrator/definition-of-done.md`，两者都不在 iteration 重复生成。

Coding 在修改代码前用 `evidence_orchestrator_select_test_process` 选择每个适用工序。Issue 驱动的新 iteration 还必须通过 `evidence_orchestrator_run_test_step` 执行工序声明的质量命令；该工具会把观察到的退出码、stdout/stderr 哈希与 Git 工作树哈希追加到场景执行日志。场景 JSON evidence 由这些记录验证，不能手工伪造 Red/Green/Refactor 退出码。

Coding 阶段遵循本仓库的 monorepo 边界：实现和测试必须落在所属的 `apps/*` 或 `libs/*` 项目中，不创建根级 `src/`、`tests/`。阶段完成工具会检查当前阶段、待审核 Gate 和必需输出；CI 通过 `pnpm orchestrator:test` 验证工作流状态迁移与代码目录发现逻辑，并通过 `pnpm orchestrator:validate` 验证活动迭代状态、输入和 Gate 元数据。

`/evidence-run` 直接启动 `.pi/agents/` 中当前阶段所属的独立 pi subagent；父会话不再切换模型或代执行阶段任务。每个 agent 的 frontmatter 是其角色、模型、推理档位和工具权限的唯一配置：Requirements/Domain/Learn 使用 Sol × High，Architecture/Review 使用 Sol × xHigh，Planning/Coding 使用 Terra × Medium。缺少 agent、模型或凭证时执行会显式失败，不做回退。

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+
- Rust toolchain (`cargo`, `rustc`)
- Tauri system dependencies: https://tauri.app/start/prerequisites/
- PostgreSQL (for the backend)
- GitHub CLI (`gh`) authenticated with access to the requirement repository

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

| Path                                                 | Purpose                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `apps/web/`                                          | React + Vite frontend composition root                         |
| `libs/web/*`                                         | Web shell, feature, UI and API-client libraries                |
| `apps/server/`                                       | Rust Axum composition root                                     |
| `libs/server/{api,domain,persistent,infrastructure}` | Rust server implementation libraries                           |
| `apps/server-nest/`                                  | Nest composition root                                          |
| `libs/server-nest/*`                                 | Nest domain, API and persistence implementation track          |
| `apps/desktop/`                                      | Tauri 2 desktop shell                                          |
| `apps/desktop/src-tauri/`                            | Tauri Rust config and capabilities                             |
| `Cargo.toml`                                         | Rust workspace root                                            |
| `nx.json`                                            | Nx workspace configuration                                     |
| `pnpm-workspace.yaml`                                | pnpm workspace (packages: `apps/*`)                            |
| `docs/product/`                                      | Canonical product knowledge                                    |
| `.evidence/`                                         | Canonical domain model                                         |
| `docs/architecture/`                                 | Canonical architecture knowledge                               |
| `engineering/evidence-orchestrator/`                 | Runtime contexts, test processes and shared DoD                |
| `artifacts/iterations/`                              | Immutable iteration evidence                                   |
| `AGENTS.md`                                          | Agent coding standards, domain guide, repo map, git discipline |

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
