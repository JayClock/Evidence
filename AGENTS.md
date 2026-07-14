Evidence 是一个领域建模与证据映射平台，具有三个运行时界面：

- **Web**：位于 `apps/web/` 的 React + Vite SPA，由 `libs/web/*` 组成。
- **Server**：位于 `apps/server/` 的 Rust Axum 组合根；实现在 `libs/server/{api,domain,persistent,infrastructure}`，浏览器模式使用 PostgreSQL。
- **Desktop**：位于 `apps/desktop/` 的 Tauri 2 桌面壳，加载和构建 `apps/web`，并在进程内启动复用同一 Rust API 的 SQLite 服务。

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

apps/desktop/              Tauri 壳 + apps/web
    ↓ command 动态发现
内嵌 Rust Axum API（随机 localhost 端口）
    ↓ SeaORM
SQLite（应用数据目录）
```

Desktop 模式在 Tauri 壳中包装 `apps/web`：

- **dev**：Tauri 在 `http://127.0.0.1:4200` 启动 `apps/web`，同时启动内嵌 API。
- **build**：Tauri 运行 `pnpm nx build @evidence/web`，并打包 `apps/web/dist`。
- 前端通过 `get_api_base_url` command 获取随机端口，不依赖外部 PostgreSQL Server。

### 领域模型

后端使用分层、trait 驱动的架构：

| 层            | 路径                              | 职责                                                                              |
| ------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| Axum API      | `libs/server/api/src/api/`        | Axum 路由、请求解析、带 `_links` 的 HAL 风格 JSON 响应                            |
| Rust 领域层   | `libs/server/domain/src/domain/`  | 纯领域 trait（`Entity`、`HasMany`、`Users`、`WorkspaceMembers` 等），不依赖持久化 |
| Rust 持久化层 | `libs/server/persistent/src/`     | 基于 SeaORM + PostgreSQL/SQLite 的领域 trait 实现                                 |
| 基础设施      | `libs/server/infrastructure/src/` | Pi RPC 领域架构等适配器                                                           |
| Nest 路线     | `libs/server-nest/*/src/`         | TypeScript/Nest 实现；仅在场景归属该运行时时使用                                  |

#### 核心抽象（`src/domain/core/`）

- **`Entity`**：trait，提供 `identity()` → `&Self::Identity` 和 `description()` → `&Self::Description`。
- **`HasOne<T>` / `HasMany<T>`**：关联读取抽象；集合提供 `find_all(from, to)`、`find_by_identity(id)`、`size()`。
- **`Ref<T>`**：用于跨实体关系的类型化引用包装器。

#### 领域聚合

| 聚合 / 概念           | 路径                             | 说明                                                  |
| --------------------- | -------------------------------- | ----------------------------------------------------- |
| `User`                | `domain/user.rs`                 | 用户身份及 `UserWorkspaces` 子集合                    |
| `Workspace`           | `domain/workspace.rs`            | 成员、单一当前图、逻辑实体与逻辑关系的容器            |
| `Member`              | `domain/member.rs`               | 工作区成员资格（用户引用 + 角色）                     |
| `Diagram`             | `domain/diagram/`                | 包含节点和边的逻辑模型投影                            |
| `DiagramNode`         | `domain/diagram/node.rs`         | 引用逻辑实体的位置与样式投影                          |
| `DiagramEdge`         | `domain/diagram/edge.rs`         | 可引用逻辑关系的连线投影                              |
| `LogicalEntity`       | `domain/logical_entity.rs`       | Evidence、Participant、Role 或 Context 类型的业务概念 |
| `LogicalRelationship` | `domain/logical_relationship.rs` | 工作区内两个逻辑实体之间的业务关系                    |

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

| 路由                                                                     | 方法                   | 说明                       |
| ------------------------------------------------------------------------ | ---------------------- | -------------------------- |
| `/api`、`/health`、`/api/openapi.json`                                   | GET                    | 根资源、健康检查与 OpenAPI |
| `/api/users/{userId}`                                                    | GET                    | 用户资源                   |
| `/api/users/{userId}/sidebar`                                            | GET                    | 工作区导航投影             |
| `/api/users/{userId}/workspaces[/{workspaceId}]`                         | GET、POST、PUT、DELETE | 工作区 CRUD                |
| `/api/users/{userId}/workspaces/{workspaceId}/members[/{memberId}]`      | GET、POST、DELETE      | 成员查询、添加与移除       |
| `/api/workspaces/{workspaceId}/diagram`                                  | GET                    | 当前工作区图               |
| `/api/workspaces/{workspaceId}/diagram/nodes[/{nodeId}]`                 | GET                    | 图节点投影                 |
| `/api/workspaces/{workspaceId}/diagram/edges[/{edgeId}]`                 | GET                    | 图边投影                   |
| `/api/workspaces/{workspaceId}/diagram/propose-model`                    | POST (SSE)             | 流式生成 AI 建模提案       |
| `/api/workspaces/{workspaceId}/logical-entities[/{entityId}]`            | GET、POST、PUT、DELETE | 逻辑实体 CRUD              |
| `/api/workspaces/{workspaceId}/logical-relationships[/{relationshipId}]` | GET、POST、PUT、DELETE | 逻辑关系 CRUD              |

### 测试策略

Fake、SQLite 与 PostgreSQL 实现共享相同的**契约测试**：

1. **Fake store**（`persistent/test_support.rs` 中的 `FakeUsers`）：内存实现，始终运行。
2. **SQLite**（`DbUsers`）：位于 `sqlite-tests` feature 后，使用临时数据库。
3. **PostgreSQL**（`DbUsers`）：位于 `postgres-tests` feature 后，需要 Docker 或 `TEST_DATABASE_URL`。

契约测试定义在 `persistent/test_support.rs::contracts`，并由各实现共同执行：

- `user_sees_seed_workspace`
- `creating_workspace_adds_owner_member`
- `duplicate_member_is_conflict`
- `workspace_has_one_diagram`
- `workspace_logical_entities_crud`
- `workspace_logical_relationships_crud`

各实现均注入相同默认数据：`desktop-user` → `default-workspace`。

## 编码规范

### TypeScript（前端）

- `apps/web` 是唯一的前端组合根；可复用 React shell、feature 和组件位于 `libs/web/*`，Desktop 不复制前端源码。
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
  5. 在 `persistent/migration/` 添加并注册 migration 与索引。
  6. 接入 `FakeUsers`（快速测试）和 `DbUsers` 的 SQLite/PostgreSQL 契约测试。
- 对较长的 handler 文件（如 `api/diagrams.rs` 约 500 行），优先提取资源序列化 helper 到独立模块，再拆分路由。

### Desktop（Tauri）

- `apps/desktop/project.json` 声明 `implicitDependencies: ["@evidence/web"]`，桌面端始终依赖 Web 前端。
- `apps/desktop/src-tauri/tauri.conf.json` 是 dev/build/bundle 配置的唯一事实来源。
- Desktop 通过 Nx executor 使用 `cargo build -p evidence-desktop`、`cargo test -p evidence-desktop`、`cargo clippy -p evidence-desktop`。
- Tauri 使用基于 capability 的权限（`capabilities/default.json`）：当前为 `core:default`、`dialog:allow-open` 与 `opener:default`。
- Desktop 在应用数据目录维护 `evidence.sqlite`，并通过 `get_api_base_url` 暴露内嵌 API 地址。

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
| `libs/server/persistent/src/`             | SeaORM + PostgreSQL/SQLite 实现                                 |
| `libs/server/infrastructure/src/`         | Rust 基础设施适配器                                             |
| `apps/server-nest/`、`libs/server-nest/*` | Nest 组合根与 TypeScript 实现路线                               |
| `libs/web/*`                              | 共享 Web 壳、UI、API 客户端和功能库                             |
| `docs/product/`                           | 跨迭代统一维护的产品上下文、画像、旅程与故事地图                |
| `.evidence/`                              | Evidence 产品权威领域模型                                       |
| `docs/architecture/`                      | 跨迭代统一维护的架构与测试策略                                  |
| `contracts/`                              | 可执行 API 契约                                                 |
| `.pi/extensions/evidence-orchestrator/`   | 确定性多 Agent 编排器、状态机、Gate 与执行证据                  |
| `.pi/agents/`                             | 隔离上下文的阶段专业 Agent                                      |
| `engineering/evidence-orchestrator/`      | 运行时上下文、可复用测试工序与统一 DoD                          |
| `artifacts/iterations/`                   | 不可变的单轮输入、增量、决策与执行证据                          |
| `apps/desktop/`                           | Tauri 2 桌面壳                                                  |
| `apps/desktop/src-tauri/`                 | Tauri Rust crate、配置与 capabilities                           |
| `Cargo.toml`                              | Rust workspace（成员：`apps/server`、`apps/desktop/src-tauri`） |
| `nx.json`                                 | Nx workspace 配置与插件注册表                                   |
| `pnpm-workspace.yaml`                     | pnpm workspace package 边界                                     |
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
