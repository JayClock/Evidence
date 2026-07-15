# Evidence

Evidence 是一个领域建模与证据映射平台，帮助领域专家和业务分析师定义业务概念，把证据、参与者、角色与上下文组织成可演进的逻辑模型，并通过关系图进行理解和评审。

项目提供三个运行时界面：

- **Web**：React + Vite SPA；
- **Server**：Rust Axum 主实现，以及独立的 TypeScript / Nest 实现轨道；
- **Desktop**：Tauri 2 壳，复用同一个 Web 前端并内嵌本地 API。

仓库还包含项目本地的 **Evidence Orchestrator**，仅用于辅助当前仓库开发 Evidence。它是内部研发工具，不是 Evidence 面向用户的产品能力；Evidence 自身作为 dogfooding 示例不改变这一边界。边界决定见 [`engineering/evidence-orchestrator/product-boundary.md`](./engineering/evidence-orchestrator/product-boundary.md)。

[产品能力](#产品能力) · [产品架构](#产品架构) · [Evidence Orchestrator](#evidence-orchestrator) · [快速开始](#快速开始) · [仓库地图](#仓库地图) · [AGENTS.md](./AGENTS.md)

## 产品能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **逻辑模型编写**：在工作区定义 `LogicalEntity` 与 `LogicalRelationship`。
3. **图投影**：使用 `Diagram`、`DiagramNode` 和 `DiagramEdge` 展示逻辑模型；图元素不是逻辑实体本身。
4. **AI 模型辅助**：AI Modeling Agent 可以提出 `ModelingProposal`，但必须由用户确认后才能改变权威模型。
5. **Web / Desktop 一致体验**：Tauri 复用唯一的 React 前端，不维护第二套产品语义。

## 产品架构

### Runtime 拓扑

```text
Browser
  └─ apps/web + libs/web/*                React + Vite :4200
       └─ REST / HAL
           ├─ apps/server + libs/server/* Rust Axum :3000
           │    └─ SeaORM → PostgreSQL
           └─ apps/server-nest + libs/server-nest/*
                └─ Prisma → PostgreSQL

Desktop
  └─ apps/desktop                         Tauri 2 shell
       ├─ 复用 apps/web / libs/web/*
       └─ 内嵌 Axum API（随机 localhost 端口）→ SQLite
```

- `apps/web` 是唯一前端组合根，功能与 API 客户端位于 `libs/web/*`。
- Desktop 开发时启动 `http://127.0.0.1:4200`，构建时打包 `apps/web/dist`。
- Desktop 在应用数据目录维护 `evidence.sqlite`，不要求单独启动 PostgreSQL 服务。
- 浏览器模式默认由 Vite 将 `/api` 与 `/health` 代理到 `127.0.0.1:3000`。
- Rust 与 Nest 均保留为服务端实现轨道，但单个 Feature 不得混合两套实现。

### Rust 分层

```text
apps/server/                         composition root
  ↓
libs/server/api/                    Axum 路由、请求解析、HAL 序列化
  ↓
libs/server/domain/                 纯领域 trait 与聚合
  ↑
libs/server/persistent/             SeaORM + PostgreSQL / SQLite adapter
libs/server/infrastructure/         Pi RPC 等外部适配器
```

领域层使用 `Entity`、`HasOne<T>`、`HasMany<T>` 与 `Ref<T>`。API handler 只做协议转换和委托，业务规则位于 domain，持久化层实现领域 trait。

### 领域模型

| 聚合 / 概念           | 说明                                                  |
| :-------------------- | :---------------------------------------------------- |
| `User`                | 用户身份以及可访问的工作空间                          |
| `Workspace`           | 成员、逻辑模型、图与本地 `.evidence` 的协作边界       |
| `Member`              | 用户到工作空间的成员关系与角色                        |
| `LogicalEntity`       | Evidence、Participant、Role 或 Context 类型的业务概念 |
| `LogicalRelationship` | 工作区内两个逻辑实体之间的业务关系                    |
| `Diagram`             | 逻辑模型的可视投影；一个工作区拥有一个当前图          |
| `DiagramNode`         | 引用逻辑实体的位置与样式投影                          |
| `DiagramEdge`         | 可表示逻辑关系的连线投影，生命周期独立于逻辑关系      |
| `ModelingProposal`    | AI Agent 提出的实体 / 关系变更建议，需用户确认        |

逻辑实体类型：

| 类型          | 用途             | 子类型                                                                                             |
| :------------ | :--------------- | :------------------------------------------------------------------------------------------------- |
| `EVIDENCE`    | 业务证据与文档   | `rfp`、`proposal`、`contract`、`fulfillment_request`、`fulfillment_confirmation`、`other_evidence` |
| `PARTICIPANT` | 参与者和事物     | `party`、`thing`                                                                                   |
| `ROLE`        | 参与者扮演的角色 | `party`、`domain`、`3rd system`、`context`、`evidence`                                             |
| `CONTEXT`     | 业务语义边界     | `bounded_context`                                                                                  |

核心规则：

- Workspace 是成员、逻辑模型和图的协作边界；
- LogicalEntity 可以独立于 Diagram 存在；
- LogicalRelationship 的 source / target 必须引用同一工作区内存在的逻辑实体；
- DiagramNode 只能引用现有逻辑实体；
- DiagramEdge 可以表示 LogicalRelationship，但二者生命周期不同；
- AI 提案不能绕过用户确认直接修改权威模型。

### REST API

API 遵循 HAL 风格：资源使用 `_links` 导航，集合使用 `_embedded`，分页使用 `page` 与 `pageSize`。OpenAPI 权威契约位于 `contracts/api.yaml`。

| 方法             | 路径                                                                   | 用途                       |
| :--------------- | :--------------------------------------------------------------------- | :------------------------- |
| GET              | `/api`、`/health`、`/api/openapi.json`                                 | API 根、健康检查与 OpenAPI |
| GET              | `/api/users/{userId}`                                                  | 用户资源                   |
| GET              | `/api/users/{userId}/sidebar`                                          | 用户工作空间导航投影       |
| GET, POST        | `/api/users/{userId}/workspaces`                                       | 查询 / 创建工作空间        |
| GET, PUT, DELETE | `/api/users/{userId}/workspaces/{workspaceId}`                         | 工作空间 CRUD              |
| GET, POST        | `/api/users/{userId}/workspaces/{workspaceId}/members`                 | 查询 / 添加成员            |
| DELETE           | `/api/users/{userId}/workspaces/{workspaceId}/members/{memberId}`      | 移除成员                   |
| GET              | `/api/workspaces/{workspaceId}/diagram`                                | 当前工作区图               |
| GET              | `/api/workspaces/{workspaceId}/diagram/nodes[/{nodeId}]`               | 图节点投影                 |
| GET              | `/api/workspaces/{workspaceId}/diagram/edges[/{edgeId}]`               | 图边投影                   |
| POST (SSE)       | `/api/workspaces/{workspaceId}/diagram/propose-model`                  | 流式生成 AI 建模提案       |
| GET, POST        | `/api/workspaces/{workspaceId}/logical-entities`                       | 查询 / 创建逻辑实体        |
| GET, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-entities/{entityId}`            | 逻辑实体 CRUD              |
| GET, POST        | `/api/workspaces/{workspaceId}/logical-relationships`                  | 查询 / 创建逻辑关系        |
| GET, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-relationships/{relationshipId}` | 逻辑关系 CRUD              |

默认种子数据为 `desktop-user → default-workspace`，并自动创建 owner 成员关系。

### 持久化与契约测试

相同的领域契约由多种 adapter 复用：

- **Fake store**：纯内存，始终运行，用于快速测试；
- **SQLite**：Desktop 的本地持久化；`sqlite-tests` 使用临时数据库；
- **PostgreSQL**：浏览器 / Server 生产轨道；`postgres-tests` 使用 `TEST_DATABASE_URL` 或 Testcontainers。

共享契约覆盖默认工作空间、创建者 owner 关系、重复成员冲突、单图语义、逻辑实体 CRUD 和逻辑关系 CRUD。

```sh
cargo test -p evidence-server
cargo test -p evidence-server --no-default-features --features sqlite-tests
cargo test -p evidence-server --features postgres-tests
```

## Evidence Orchestrator

> **内部工具边界**：本节说明当前仓库贡献者如何开发 Evidence，不属于产品能力、产品画像、用户旅程或 `.evidence` 产品领域模型。完整决定见 [`engineering/evidence-orchestrator/product-boundary.md`](./engineering/evidence-orchestrator/product-boundary.md)。

Evidence Orchestrator 位于 `.pi/extensions/evidence-orchestrator/`。Extension 负责确定性状态、执行、路径保护和审计；`.pi/agents/` 定义隔离角色；`.pi/skills/` 承载 Complicated / Complex 方法；`.pi/prompts/` 承载 Clear 固定任务。人类始终担任 Navigator。源码按 `iteration/`、`loops/`、`capabilities/` 与 `adapters/` 组织，旧的线性技术阶段目录已删除。

### v5 知识循环

```mermaid
flowchart LR
  I[GitHub Issue frozen snapshot] --> K[Kickoff]
  K --> U[Understand]
  U --> T[Tasking]
  T --> P[Pair]
  P --> S[Showcase]
  S --> R[Respond]
  R --> C[Complete]

  S -. product or domain gap .-> U
  S -. architecture or process gap .-> T
  S -. test or implementation gap .-> P
  U -. problem gap .-> K
```

一次 iteration 只处理一个人工确认的 Story 和一个人工确认的 Scenario：

- **Kickoff**：从冻结 Issue 提出一个 Story 候选，由人类确认、修订、拆分或延期；
- **Understand**：单 Story TQA、人工 Scenario 确认、人工建模 Profile、Builder 展开与只读 Challenger；
- **Tasking**：唯一匹配 test-process v2，生成 test/task list，并等待人工 Desk Check；
- **Pair**：Navigator 每次推进一个 Red/Green/Refactor 或最终 quality-gate checkpoint，Test/Production Driver 受路径保护；
- **Showcase**：重跑 Q2，显式决定 Q3/Q4，由独立只读 Reviewer 检查，最后由人类接受、修订或拒绝；
- **Respond**：只提升本轮实际使用并验证的知识，允许有理由的空 promotion，人工确认后输出 next Probe。

反馈按知识缺口回到产生它的 loop，不维护独立审批队列或重试流水线。状态使用 `loop` 及其局部 stage/checkpoint 表示。

### 知识与证据位置

| 内容              | 权威来源                                            | Iteration 中的记录                                |
| :---------------- | :-------------------------------------------------- | :------------------------------------------------ |
| 需求请求          | GitHub Issue / Projects                             | 冻结 `issue.json` 与只读 `requirements.md`        |
| 产品知识          | `docs/product/`                                     | 当前 Story 的问题与 Scenario 增量                 |
| 领域模型          | `.evidence/`                                        | 模型候选、投影、挑战与 Scenario 展开              |
| 架构              | `docs/architecture/`                                | Scenario 相关上下文与决定                         |
| API 契约          | `contracts/api.yaml`                                | 契约增量                                          |
| 测试工序          | `engineering/evidence-orchestrator/test-processes/` | 人工批准且哈希锁定的计划                          |
| Working Knowledge | `.pi/skills/`、`.pi/prompts/` 与 catalog            | 实际使用版本和验证反馈                            |
| 执行与反馈        | `artifacts/iterations/ITER-xxxx/`                   | append-only 观测、manifest、人工决定与 next Probe |

执行日志是命令事实的唯一原始来源；manifest 和 summary 由工具确定性生成。旧 iteration 保持不可变，只提供终态只读查看，不参与 v5 执行或验证。

### 在 Pi 中使用

前置条件：在仓库根目录启动 Pi，且 `gh auth status` 能访问当前 GitHub 仓库。

```text
/evidence-new
/evidence-status
/evidence-run [--dry-run]
/evidence-issue-status
/evidence-issue-sync
/evidence-kickoff confirm|revise|split|defer <reason>
/evidence-scenario confirm <DRAFT-xxx> <reason>
/evidence-scenario continue|split|defer <reason>
/evidence-modeling-profile confirm|revise <reason>
/evidence-desk-check approve|revise|scenario-gap|architecture-gap|process-gap <reason>
/evidence-pair accept-red|back-test|back-implementation|back-tasking|retry-quality <reason>
/evidence-showcase accept|revise|reject <reason>
/evidence-respond approve|revise <reason>
```

Issue 只在 Kickoff 内显式同步；进入 Understand 后需求变化必须由人类在 iteration 边界创建新快照。`/evidence-run` 每次只推进当前 loop 的一个活动或确定性 checkpoint，并在人工决定前停止。

维护细节见 [`.pi/extensions/evidence-orchestrator/README.md`](./.pi/extensions/evidence-orchestrator/README.md)。

### Orchestrator 验证

```sh
pnpm orchestrator:test
pnpm orchestrator:validate
pnpm exec eslint '.pi/extensions/evidence-orchestrator/**/*.ts' --no-warn-ignored
pnpm exec prettier --check '.pi/extensions/evidence-orchestrator/**/*.{ts,md}'
```

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 10+
- Rust toolchain（`cargo`、`rustc`）
- 浏览器 / Server 模式：PostgreSQL
- Desktop 模式：[Tauri 2 系统依赖](https://tauri.app/start/prerequisites/)
- Orchestrator：Pi 与已认证的 GitHub CLI（`gh`）

### 安装

```sh
pnpm install
```

### 浏览器模式

分别启动 Rust Server 和 Web：

```sh
# Terminal 1
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/evidence pnpm dev:server

# Terminal 2
pnpm dev:web
```

打开 `http://localhost:4200`。SeaORM 会执行 migration 并注入默认数据。

### Desktop 模式

```sh
pnpm dev:desktop
```

Tauri 会启动同一个 Web 前端，并在进程内启动 Axum API。数据保存在应用数据目录的 SQLite 文件中，无需另行启动 Server 或 PostgreSQL。

### 仅启动 Rust Server

```sh
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/evidence \
  cargo run -p evidence-server

curl http://127.0.0.1:3000/health
```

环境变量：

| 变量                 | 默认值           | 说明                                           |
| :------------------- | :--------------- | :--------------------------------------------- |
| `DATABASE_URL`       | 必填             | SeaORM 数据库连接字符串                        |
| `PGSQL_DATABASE_URL` | fallback         | PostgreSQL 兼容变量名                          |
| `API_ADDR`           | `127.0.0.1:3000` | Rust Server 监听地址                           |
| `VITE_API_BASE_URL`  | `/api`           | 浏览器模式 API 根；Tauri 中由 command 动态发现 |

## 常用命令

```sh
# 查看 Nx 项目
pnpm nx show projects

# 全仓质量门禁
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Web
pnpm nx build @evidence/web
pnpm nx test @evidence/web --run
pnpm nx typecheck @evidence/web
pnpm nx lint @evidence/web

# Rust Server
cargo test -p evidence-server
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo fmt -p evidence-server -- --check

# Desktop
cargo test -p evidence-desktop
cargo clippy -p evidence-desktop --all-targets -- -D warnings
cargo fmt -p evidence-desktop -- --check

# API 契约与生成客户端
pnpm api:export
pnpm api:generate
pnpm api:contracts

# Evidence Orchestrator
pnpm orchestrator:test
pnpm orchestrator:validate
```

## 仓库地图

| 路径                                                  | 用途                                         |
| :---------------------------------------------------- | :------------------------------------------- |
| `apps/web/`                                           | React + Vite 前端组合根                      |
| `libs/web/*`                                          | Web shell、feature、UI 与 HATEOAS API client |
| `apps/server/`                                        | Rust Axum 组合根                             |
| `libs/server/{api,domain,persistent,infrastructure}/` | Rust 服务端分层实现                          |
| `apps/server-nest/`                                   | Nest 组合根（独立服务端轨道）                |
| `libs/server-nest/*`                                  | Nest API、domain 与 Prisma persistence       |
| `apps/desktop/`                                       | Tauri 2 Desktop 壳与内嵌 API 启动            |
| `contracts/api.yaml`                                  | OpenAPI 权威契约                             |
| `libs/contracts/api-contracts/`                       | 可执行 API 契约测试                          |
| `docs/product/`                                       | 跨迭代统一产品知识                           |
| `.evidence/`                                          | Evidence 平台权威领域模型                    |
| `docs/architecture/`                                  | 跨迭代统一架构与测试策略                     |
| `engineering/evidence-orchestrator/`                  | Runtime contexts、测试工序与统一 DoD         |
| `.pi/extensions/evidence-orchestrator/`               | 内部知识循环、状态保护与执行证据             |
| `.pi/agents/`                                         | 隔离活动角色配置                             |
| `evidence-state.json`                                 | 当前 v5 iteration、loop 与活动工作项状态     |
| `artifacts/iterations/`                               | 单轮输入、delta、决策与执行证据              |
| `AGENTS.md`                                           | 架构边界、编码规范、验证与 Git 纪律          |

## 开发约定

- `apps/web` 是唯一前端源码入口；Desktop 不创建第二套 React 页面；
- 一个服务端 Feature 只能属于 Rust 或 Nest 轨道；
- Rust 先定义 domain trait，再实现 persistence adapter；handler 不承载业务规则；
- API 变化同步实现、`contracts/api.yaml`、契约测试和生成客户端；
- 新持久化行为同时维护 Fake、SQLite / PostgreSQL adapter 的契约一致性；
- 提交前运行受影响 runtime 的 test、typecheck / clippy、lint 和 format check。

仓库使用 Husky、lint-staged 与 commitlint。提交格式：

```text
<type>(<scope>): <subject>

feat(web): add diagram proposal review
fix(server): validate relationship workspace boundary
chore(workspace): update nx configuration
```

允许的 scope：`web`、`desktop`、`server`、`workspace`、`deps`、`ci`、`docs`、`release`。

## License

MIT.
