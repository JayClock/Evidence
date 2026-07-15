Evidence 是一个领域建模与证据映射平台，具有三个运行时界面：

- **Web**：位于 `apps/web/` 的 React + Vite SPA，由 `libs/web/*` 组成。
- **Server**：位于 `apps/server/` 的 Rust Axum 组合根；实现在 `libs/server/{api,domain,persistent,infrastructure}`。
- **Desktop**：位于 `apps/desktop/` 的 Tauri 2 桌面壳，加载和构建 `apps/web`。

`apps/server-nest/` 和 `libs/server-nest/*` 是 TypeScript/Nest 实现路线。不得在同一个功能中混用 Rust 与 Nest 模块：架构必须选择所属服务端运行时及其对应的测试工序。Web 与 Desktop 仍是同一个前端产品，共享 REST/API 语义与领域语义。

## 架构概览

```
apps/web/                  React + Vite 组合根（端口 4200）
    ↓
libs/web/*                 壳、功能、UI 和 API 客户端
    ↓ HTTP
apps/server/               Rust Axum 组合根（端口 3000）
    ↓
libs/server/*              API、领域、持久化与基础设施
    ↓ SeaORM
PostgreSQL                 持久化层

apps/server-nest/          Nest 组合根（TypeScript 路线）
    ↓
libs/server-nest/*         API、领域和 Prisma 持久化
```

Desktop 模式在 Tauri 壳中包装 `apps/web`：

- **dev**：Tauri 在 `http://127.0.0.1:4200` 启动 `apps/web` 并打开它。
- **build**：Tauri 运行 `pnpm nx build @evidence/web`，并打包 `apps/web/dist`。

### 领域模型

后端使用分层、trait 驱动的架构：

| 层            | 路径                              | 职责                                                                              |
| ------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| Axum API      | `libs/server/api/src/api/`        | Axum 路由、请求解析、带 `_links` 的 HAL 风格 JSON 响应                            |
| Rust 领域层   | `libs/server/domain/src/domain/`  | 纯领域 trait（`Entity`、`HasMany`、`Users`、`WorkspaceMembers` 等），不依赖持久化 |
| Rust 持久化层 | `libs/server/persistent/src/`     | 基于 SeaORM + PostgreSQL 的领域 trait 实现                                        |
| 基础设施      | `libs/server/infrastructure/src/` | Pi RPC 领域架构等适配器                                                           |
| Nest 路线     | `libs/server-nest/*/src/`         | TypeScript/Nest 实现；仅在场景归属该运行时时使用                                  |

#### 核心抽象（`src/domain/core/`）

- **`Entity`**：trait，提供 `identity()` → `&Self::Identity` 和 `description()` → `&Self::Description`。
- **`HasMany<T>`**：子集合 trait，提供 `find_all(from, to)`、`find_by_identity(id)`、`size()`。
- **`Ref<T>`**：用于跨实体关系的类型化引用包装器。

#### 领域聚合

| 聚合            | 路径                       | 说明                                                                            |
| --------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `User`          | `domain/user.rs`           | 用户身份及 `UserWorkspaces` 子集合                                              |
| `Workspace`     | `domain/workspace.rs`      | 包含 `WorkspaceMembers`、`WorkspaceDiagrams`、`WorkspaceLogicalEntities` 的容器 |
| `Member`        | `domain/member.rs`         | 工作区成员资格（用户引用 + 角色）                                               |
| `Diagram`       | `domain/diagram/`          | 包含 `DiagramNodes`、`DiagramEdges` 的可视化图                                  |
| `DiagramNode`   | `domain/diagram/node.rs`   | 图上的节点（类型、位置、逻辑实体引用、样式）                                    |
| `DiagramEdge`   | `domain/diagram/edge.rs`   | 节点间边（源/目标、关系类型、标签）                                             |
| `LogicalEntity` | `domain/logical_entity.rs` | 类型化领域概念：Evidence、Participant、Role 或 Context；具有属性、行为和子类型  |

#### 逻辑实体类型

| 类型          | 子类型                                                                                 |
| ------------- | -------------------------------------------------------------------------------------- |
| `EVIDENCE`    | rfp、proposal、contract、fulfillment_request、fulfillment_confirmation、other_evidence |
| `PARTICIPANT` | party、thing                                                                           |
| `ROLE`        | party、domain、3rd system、context、evidence                                           |
| `CONTEXT`     | bounded_context                                                                        |

### API 设计

API 遵循 HAL 风格约定：

- 所有资源包含 `self`、`collection` 和关联资源链接的 `_links`。
- 集合使用 `_embedded` 保存子资源，使用 `page` 保存分页元数据。
- 分页使用 `page` 和 `pageSize` 查询参数。

#### API 路由

| 路由                                                | 方法             | 说明                                   |
| --------------------------------------------------- | ---------------- | -------------------------------------- |
| `/api`                                              | GET              | 根资源，含 health 和 default-user 链接 |
| `/health`                                           | GET              | 健康检查                               |
| `/api/users/{userId}`                               | GET              | 用户资源                               |
| `/api/users/{userId}/workspaces`                    | GET、POST        | 列出/创建工作区                        |
| `/api/users/{userId}/workspaces/{id}`               | GET、PUT、DELETE | 工作区 CRUD                            |
| `/api/users/{userId}/workspaces/{id}/members`       | GET、POST        | 列出/添加成员                          |
| `/api/users/{userId}/workspaces/{id}/members/{mid}` | DELETE           | 移除成员                               |
| `/api/workspaces/{id}/diagrams`                     | GET、POST        | 列出/创建图                            |
| `/api/workspaces/{id}/diagrams/{did}`               | GET、PUT、DELETE | 图 CRUD                                |
| `/api/workspaces/{id}/diagrams/{did}/nodes`         | GET、POST        | 列出/创建节点                          |
| `/api/workspaces/{id}/diagrams/{did}/nodes/{nid}`   | GET、PUT、DELETE | 节点 CRUD                              |
| `/api/workspaces/{id}/diagrams/{did}/edges`         | GET、POST        | 列出/创建边                            |
| `/api/workspaces/{id}/diagrams/{did}/edges/{eid}`   | GET、PUT、DELETE | 边 CRUD                                |
| `/api/workspaces/{id}/logical-entities`             | GET、POST        | 列出/创建逻辑实体                      |
| `/api/workspaces/{id}/logical-entities/{eid}`       | GET、PUT、DELETE | 逻辑实体 CRUD                          |

### 测试策略

两种持久化实现共享相同的**契约测试**：

1. **Fake store**（`persistent/test_support.rs` 中的 `FakeUsers`）：内存实现，始终运行。
2. **PostgreSQL**（`persistent/users.rs` 中的 `PgUsers`）：位于 `#[cfg(feature = "postgres-tests")]` 后，需要 Docker 或 `TEST_DATABASE_URL`。

契约测试定义在 `persistent/test_support.rs::contracts`，并由两种实现共同执行：

- `user_sees_seed_workspace`
- `creating_workspace_adds_owner_member`
- `duplicate_member_is_conflict`
- `workspace_logical_entities_crud`

两种实现均注入相同默认数据：`desktop-user` → `default-workspace`。

## 编码规范

### TypeScript（前端）

- `apps/web` 是唯一的前端源码入口。所有 React 组件都位于此处。
- 路由使用 `react-router-dom`。当前路由只是脚手架，应替换为领域专用视图。
- Nx 插件 `@nx/vite` 负责 build/test/serve/dev/preview targets；不得在 `project.json` 中手动配置 Vite targets。
- Nx 插件 `@nx/vitest` 负责 test targets；测试文件匹配 `{src,tests}/**/*.{test,spec}.*`。
- Vite 开发服务器运行在 `http://127.0.0.1:4200`（配置见 `apps/web/vite.config.mts`）。
- Tauri dev 通过 `beforeDevCommand` 启动 Vite；桌面壳必须与 Web 前端协同开发。

### Rust（后端）

- **先定义领域 trait**：先在 `domain/` 中定义 `async_trait` trait，再在 `persistent/` 中实现。
- **API handler 中不得包含业务逻辑**：handler 只负责解析、委托和序列化；所有业务规则位于 `domain/`。
- **使用 `Entity` + `HasMany` 模式**：每个聚合实现 `Entity`；子集合实现 `HasMany<T>`。带 `_wide()` 后缀的方法返回所需的最窄 trait（例如 `members_wide()` → 用于添加/移除的 `&dyn WorkspaceMembers`，`members()` → 用于读取的 `&dyn HasMany<Member>`）。
- **错误处理**：使用 `domain::ServerError` 的 `NotFound`、`Validation`、`Conflict`、`Internal` 变体。通过 `persistent::store::db_error()` 映射 SeaORM `DbErr`。
- **时间戳格式**：所有时间戳使用 RFC 3339（`Utc::now().to_rfc3339()`）。
- **软删除**：使用 `Option<String>` 类型的 `deleted_at` 列，并在所有查询中筛除。
- 新增持久化实体时：
  1. 在 `domain/` 定义领域 trait。
  2. 在 `persistent/entities/` 创建 SeaORM 实体。
  3. 在 `persistent/` 实现 trait（以 `_test` 模块结束，用于 `#[cfg(test)]` 快速测试）。
  4. 在 `persistent/test_support.rs::contracts` 添加契约测试。
  5. 在 `persistent/store.rs::init_schema()` 注册表与索引。
  6. 接入 `FakeStore`（快速测试）和 `PgStore`（集成测试）。
- 对较长的 handler 文件（如 `api/diagrams.rs` 约 500 行），优先提取资源序列化 helper 到独立模块，再拆分路由。

### Desktop（Tauri）

- `apps/desktop/project.json` 声明 `implicitDependencies: ["@evidence/web"]`，桌面端始终依赖 Web 前端。
- `apps/desktop/src-tauri/tauri.conf.json` 是 dev/build/bundle 配置的唯一事实来源。
- Desktop 通过 Nx executor 使用 `cargo build -p evidence-desktop`、`cargo test -p evidence-desktop`、`cargo clippy -p evidence-desktop`。
- Tauri 使用基于 capability 的权限（`capabilities/default.json`）：当前为 `core:default` + `opener:default`。

### Git Hooks 与提交信息

- **pre-commit**：`lint-staged` 使用 `nx format:write` 格式化暂存文件，使用 ESLint 检查 JS/TS，并通过 `cargo fmt --all` 格式化 Rust/TOML。
- **commit-msg**：通过 `@commitlint/config-conventional` 校验 Conventional Commits。

提交格式：

```
<type>(<scope>): <subject>
```

允许的 scope：`web`、`desktop`、`server`、`workspace`、`deps`、`ci`、`docs`、`release`。

## 仓库地图

| 路径                                      | 用途                                                            |
| ----------------------------------------- | --------------------------------------------------------------- |
| `apps/web/`                               | React + Vite 前端 SPA                                           |
| `apps/server/`                            | Rust Axum 组合根                                                |
| `libs/server/api/src/api/`                | Axum HTTP 路由与 HAL 响应构建器                                 |
| `libs/server/domain/src/domain/`          | 纯领域 trait 与聚合（无框架依赖）                               |
| `libs/server/persistent/src/`             | SeaORM + PostgreSQL 实现                                        |
| `libs/server/infrastructure/src/`         | Rust 基础设施适配器                                             |
| `apps/server-nest/`、`libs/server-nest/*` | Nest 组合根与 TypeScript 实现路线                               |
| `libs/web/*`                              | 共享 Web 壳、UI、API 客户端和功能库                             |
| `docs/product/`                           | 跨迭代统一维护的产品上下文、画像、旅程与故事地图                |
| `.evidence/`                              | Evidence 产品权威领域模型                                       |
| `docs/architecture/`                      | 跨迭代统一维护的架构与测试策略                                  |
| `contracts/`                              | 可执行 API 契约                                                 |
| `.pi/extensions/evidence-orchestrator/`   | 内部六循环编排器；按 iteration/loops/capabilities/adapters 分层 |
| `.pi/agents/`                             | 隔离上下文的活动专业角色                                        |
| `engineering/evidence-orchestrator/`      | 运行时上下文、可复用测试工序与统一 DoD                          |
| `artifacts/iterations/`                   | 不可变的单轮输入、增量、决策与执行证据                          |
| `apps/desktop/`                           | Tauri 2 桌面壳                                                  |
| `apps/desktop/src-tauri/`                 | Tauri Rust crate、配置与 capabilities                           |
| `Cargo.toml`                              | Rust workspace（成员：`apps/server`、`apps/desktop/src-tauri`） |
| `nx.json`                                 | Nx workspace 配置与插件注册表                                   |
| `pnpm-workspace.yaml`                     | pnpm workspace 配置（packages：`apps/*`）                       |
| `package.json`                            | 根脚本与共享开发依赖                                            |
| `tsconfig.base.json`                      | 共享 TypeScript 基础配置                                        |
| `vitest.workspace.ts`                     | Vitest workspace 文件发现配置                                   |
| `eslint.config.mjs`                       | 根 ESLint flat config 与 Nx 模块边界规则                        |
| `commitlint.config.cjs`                   | Conventional Commit 规则与 scope 白名单                         |
| `lint-staged.config.mjs`                  | pre-commit 格式化与 lint 配置                                   |
| `.husky/`                                 | Git hooks（pre-commit、commit-msg）                             |

## 验证

创建 PR 前运行质量门禁：

```sh
# 前端
pnpm lint
pnpm typecheck
pnpm test

# 后端
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo test -p evidence-server
cargo fmt -p evidence-server -- --check

# 桌面端
cargo clippy -p evidence-desktop --all-targets -- -D warnings
cargo test -p evidence-desktop
cargo fmt -p evidence-desktop -- --check
```

PostgreSQL 集成测试：

```sh
cargo test -p evidence-server --features postgres-tests
```

若检查失败，必须修复并重新运行；不得跳过。

## Git 纪律

- 一个 commit 只处理一个关注点（功能、修复或重构）。
- 不要创建 kitchen-sink commit；混合关注点应拆分。
- 目标规模：每个 commit 少于 10 个文件、少于 1000 行变更。
- 适用时包含关联 GitHub Issue ID。

## 阅读顺序

开始在本仓库工作时，按以下顺序阅读：

1. 本文件（`AGENTS.md`）：运行时拓扑与边界。
2. `apps/server/src/main.rs`：Rust 服务启动、配置与优雅关闭。
3. `libs/server/domain/src/domain/mod.rs`：Rust 领域聚合导出。
4. `libs/server/api/src/api/mod.rs`：Axum 路由注册与中间件。
5. `libs/server/persistent/src/persistent/store.rs`：Rust 持久化设置与种子数据。
6. `libs/server/persistent/src/persistent/test_support.rs`：用于理解预期行为的契约测试。
7. `engineering/evidence-orchestrator/runtime-contexts.json`：稳定的功能上下文词汇与所属运行时。
8. `apps/desktop/src-tauri/tauri.conf.json`：Desktop/Web 边界配置。
