# Evidence

Evidence 是一个采用 8X Flow 语义的领域建模与证据映射平台，帮助领域专家和分析师定义业务概念，把证据、参与者、角色与上下文组织成可演进的逻辑模型，并通过关系图进行理解和评审。

项目提供三个运行时界面：

- **Web**：React + Vite SPA；
- **Server**：Rust Axum 主实现，以及独立的 TypeScript / Nest 实现轨道；
- **Desktop**：Tauri 2 壳，复用同一个 Web 前端并内嵌本地 API。

仓库还包含项目本地的 **Evidence Orchestrator**，用于将 GitHub Issue 按阶段推进为需求、模型、架构、计划、代码、评审与学习证据。

[产品能力](#产品能力) · [产品架构](#产品架构) · [Evidence Orchestrator](#evidence-orchestrator) · [快速开始](#快速开始) · [仓库地图](#仓库地图) · [AGENTS.md](./AGENTS.md)

## 产品能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **逻辑模型编写**：在工作区定义 `LogicalEntity` 与 `LogicalRelationship`。
3. **图投影**：使用 `Diagram`、`DiagramNode` 和 `DiagramEdge` 展示逻辑模型；图元素不是逻辑实体本身。
4. **AI 模型辅助**：AI Modeling Agent 可以提出 `ModelingProposal`，但必须由用户确认后才能改变权威模型。
5. **Web / Desktop 一致体验**：Tauri 复用唯一的 React 前端，不维护第二套产品语义。

Evidence 当前固定使用 `EVIDENCE`、`PARTICIPANT`、`ROLE` 与 `CONTEXT` 作为产品语言；它不是可任意配置类型的通用元模型编辑器。

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

Evidence Orchestrator 位于 `.pi/extensions/evidence-orchestrator/`。它是维护本仓库的工程能力，不是 Evidence 产品用户能力。扩展负责工作流状态、命令、工具、Gate、校验和执行证据；阶段角色位于 `.pi/agents/`，阶段工作在隔离的 Pi 子进程中执行。工程反馈循环和方法原则分别见 `engineering/evidence-orchestrator/delivery-journey.md` 与 `knowledge-process-principles.md`。

### 工作流

```mermaid
flowchart LR
  I[GitHub Issue] --> S[冻结快照]
  S --> K[Kickoff]
  K --> D[Discover: TQA + Examples]
  D --> M[Model: Expand + Check]
  M --> DD[Delivery Design]
  DD --> B[Build: TDD]
  B --> SH[Showcase]
  SH --> L[Learn]
  L --> X[Complete]
```

| 阶段       | 目标                                       | 关键输出                                 | 人工反馈 |
| :--------- | :----------------------------------------- | :--------------------------------------- | :------: |
| `kickoff`  | 选择一个现在值得解决的问题并固定唯一 Story | `kickoff.md`、`story.md`                 | **Gate** |
| `discover` | 用 TQA 提取隐性知识并以具体示例确认        | TQA、discovery、Given/When/Then          |  对话内  |
| `model`    | 展开场景、寻找反例并最小演进权威模型       | snapshot、delta、expansions、walkthrough | **Gate** |
| `design`   | 将一个场景映射到运行时、上下文、测试与工序 | delivery plan、scenario context map      |   auto   |
| `build`    | 以有语义的 Red → Green → Refactor 实现场景 | 测试、生产代码、`*.execution.jsonl`      |   auto   |
| `showcase` | 展示可运行增量并检查价值、模型与质量       | `showcase.md`                            | **Gate** |
| `learn`    | 将反馈转为权威知识变化或一个后续问题       | Probe/Sense/Respond、promotion、Issue    |   auto   |

一个 iteration 只有一张 Story；Build 只有一个 active Scenario。`clarify/specify/validate` 已合并为 Discover，`architecture/planning` 已合并为 Design。旧 phase、旧状态字段和旧 artifact layout 不提供兼容迁移。

确定性检查失败时，Orchestrator 保存反馈并重试；达到 `max_rounds` 才创建 Emergency Gate。常规人工反馈只出现在 Kickoff、Model walkthrough/desk check 和 Showcase。Gate 决策必须显式为 `approve`、`revise` 或 `reject`。

### 知识与证据位置

| 内容       | 权威来源                                                  | Iteration 中的记录                                  |
| :--------- | :-------------------------------------------------------- | :-------------------------------------------------- |
| 需求请求   | GitHub Issue / Projects                                   | `00-input/issue.json` 与只读需求投影                |
| 产品知识   | `docs/product/`                                           | Kickoff/Discover 中候选产品知识                     |
| 领域模型   | `.evidence/`                                              | `03-model/` 中 Git 快照、delta、展开与检查          |
| 架构       | `docs/architecture/`                                      | `04-design/delivery-plan.md` 中确有必要的场景增量   |
| API 契约   | `contracts/api.yaml`                                      | 实际契约变化及其源码引用                            |
| 测试工序   | `engineering/evidence-orchestrator/test-processes/`       | `04-design/selected-test-processes/` 不可变快照     |
| 完成定义   | `engineering/evidence-orchestrator/definition-of-done.md` | 场景特有完成条件                                    |
| 执行与反馈 | `artifacts/iterations/ITER-xxxx/`                         | TQA、模型检查、设计、JSONL 执行事实、Showcase、学习 |

稳定知识只有经过示例、模型展开、可运行软件和 Showcase 反馈后才提升到权威来源。命令事实只以 `*.execution.jsonl` 保存一次；Markdown 报告引用它，不复制退出码和哈希。

### TQA 与 Build 规则

- Kickoff 直接创建唯一 `01-kickoff/story.md`，不生成候选 Story 队列或 Story picker。
- Discover 每次先记录一个 Thought，再提出一个高价值、非技术 Question，并立即等待领域专家明确 Answer。
- 没有关键未知后，Discover 为唯一 Story 形成至少一个具体 Given/When/Then。
- Design 只选择一个已展开 Scenario，并为每个 owning runtime 唯一匹配测试工序。
- Build 先选择 `US-xxx / SC-xxx` 并记录干净 Git baseline，再执行 Red、Green、Refactor 与质量门禁。
- Red 必须由预期业务断言失败造成；依赖、编译、配置或环境错误不算 Red。
- 同时提交真实测试和生产代码，并保持 `SC → Q2 → contexts → Q1 → test double → process → code` 追踪。

Rust 与 Nest 是互斥的服务端实现轨道；Web 与 Desktop 可以组成同一垂直场景，但共享 REST 与领域语义。

### 在 Pi 中使用

前置条件：已在仓库根目录启动 Pi，且 `gh auth status` 能访问当前 GitHub 仓库。

```text
/evidence-new                         # 选择/创建 Issue、冻结快照并执行 Kickoff
/evidence-status                      # 查看反馈循环、Gate、TQA、工件和代码状态
/evidence-run --dry-run               # 预览当前阶段任务
/evidence-run                         # 执行当前阶段
/evidence-run --story=US-001 --scenario=SC-001
                                      # 在 Build 中选择唯一场景并执行
/evidence-issue-status                # 检查远端 Issue 与快照是否偏离
/evidence-issue-sync                  # 仅在 Kickoff 中显式刷新快照
/evidence-gate approve <说明>         # 通过人工反馈点
/evidence-gate revise <说明>          # 携带反馈返回修改
/evidence-gate reject <说明>          # 停止 iteration
```

Issue 是本轮需求权威来源。只有 Kickoff 期间可以刷新快照；之后需求变化必须创建新 iteration。

### Orchestrator 验证

```sh
pnpm orchestrator:test
pnpm orchestrator:validate
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

| 路径                                                  | 用途                                                     |
| :---------------------------------------------------- | :------------------------------------------------------- |
| `apps/web/`                                           | React + Vite 前端组合根                                  |
| `libs/web/*`                                          | Web shell、feature、UI 与 HATEOAS API client             |
| `apps/server/`                                        | Rust Axum 组合根                                         |
| `libs/server/{api,domain,persistent,infrastructure}/` | Rust 服务端分层实现                                      |
| `apps/server-nest/`                                   | Nest 组合根（独立服务端轨道）                            |
| `libs/server-nest/*`                                  | Nest API、domain 与 Prisma persistence                   |
| `apps/desktop/`                                       | Tauri 2 Desktop 壳与内嵌 API 启动                        |
| `contracts/api.yaml`                                  | OpenAPI 权威契约                                         |
| `libs/contracts/api-contracts/`                       | 可执行 API 契约测试                                      |
| `docs/product/`                                       | 跨迭代统一产品知识                                       |
| `.evidence/`                                          | Evidence 平台权威领域模型                                |
| `docs/architecture/`                                  | 跨迭代统一架构与测试策略                                 |
| `engineering/evidence-orchestrator/`                  | Runtime contexts、测试工序与统一 DoD                     |
| `.pi/extensions/evidence-orchestrator/`               | 工作流扩展、状态机、Gate 与证据记录                      |
| `.pi/agents/`                                         | 隔离阶段 Agent 配置                                      |
| `evidence-state.json`                                 | 当前 iteration、phase、Gate 与活动工作项状态             |
| `artifacts/iterations/`                               | 单轮输入、delta、决策与执行证据；旧 bootstrap 见目录说明 |
| `AGENTS.md`                                           | 架构边界、编码规范、验证与 Git 纪律                      |

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
