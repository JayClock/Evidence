# Evidence

Evidence 是一个领域建模与证据映射平台，帮助领域专家和业务分析师定义业务概念，把证据、参与者、角色与上下文组织成可演进的逻辑模型，并通过关系图进行理解和评审。

产品有三个运行时界面：

- **Web**：React + Vite SPA；
- **Server**：NestJS + TypeScript，Hosted 模式默认使用 PostgreSQL；
- **Desktop**：Electron 壳，复用 Web renderer，并连接经过健康检查的 Server API。

仓库还包含项目本地的 **Evidence Orchestrator**，仅用于辅助当前仓库开发 Evidence。它不是面向用户的产品能力；边界决定见 [`engineering/evidence-orchestrator/product-boundary.md`](./engineering/evidence-orchestrator/product-boundary.md)。

[产品能力](#产品能力) · [产品架构](#产品架构) · [数据库-schema](#数据库-schema) · [Evidence Orchestrator](#evidence-orchestrator) · [快速开始](#快速开始) · [仓库地图](#仓库地图) · [AGENTS.md](./AGENTS.md)

## 产品能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **Work Intake**：保存 Inbox Item、不可变来源 Revision，并由人类选择 1–5 个来源冻结 Extraction。
3. **Iteration / Kickoff**：本地 Inbox Analyst 提案后由人类 admission；Server 冻结 Intake，Desktop provision worktree，人工 Kickoff confirm 才创建 `US-001`。
4. **逻辑模型与图投影**：定义 `LogicalEntity` / `LogicalRelationship`，由单一当前 `Diagram` 展示模型。
5. **本地 AI 辅助**：Desktop 嵌入 Pi SDK，通过受限工具和 Server REST API 辅助建模与 CodingRun。
6. **人工代码审查**：每个 CodingRun 使用隔离 Git worktree；接受后才创建本地 commit，不自动 merge/push。
7. **Web / Desktop 一致体验**：Electron 复用唯一的 React 前端和 REST/HAL 语义。

## 产品架构

### Runtime 拓扑

```text
Browser
  └─ apps/web + libs/web/*                  React + Vite :4200
       └─ REST / HAL
            └─ apps/server + libs/server/*  NestJS :3000
                 ├─ Prisma registry → PostgreSQL
                 └─ workspace/.evidence YAML model

Electron
  └─ apps/desktop                            secure main/preload
       ├─ packaged apps/web renderer
       ├─ embedded Pi SDK agent
       └─ REST / HAL → configured Server API
```

- `apps/web` 是唯一前端组合根，功能与 API client 位于 `libs/web/*`。
- Server 只使用 Prisma/PostgreSQL registry；Desktop 不打包第二个 Server 或数据库。
- Web 与 Electron renderer 都消费 REST/HAL；Electron IPC 不复制业务 API。
- 打包 renderer 使用受保护的 `evidence://app/` 协议。开发 renderer 默认使用 `http://127.0.0.1:4200`。
- Electron 必须通过 `EVIDENCE_API_BASE_URL=https://…/api` 连接 API；开发时允许 loopback HTTP。

### Server 分层

```text
apps/server/                         Nest composition root
  └─ main.ts                         PostgreSQL entry
       ↓
libs/server/api/                     controllers, HAL, OpenAPI
       ↓
libs/server/domain/                  framework-free entities and ports
       ↑
libs/server/persistent/              Prisma schema/migrations and persistence adapters
```

Domain 不依赖 HTTP、Nest、Prisma、Electron 或 UI。Controller 只做协议转换和委托；runtime adapter wiring 只存在于 `apps/server`。

### 领域模型

| 聚合 / 概念                    | 说明                                                  |
| :----------------------------- | :---------------------------------------------------- |
| `User`                         | 用户身份以及可访问的工作空间                          |
| `Workspace`                    | 成员、逻辑模型、当前图与本地 `.evidence` 的协作边界   |
| `Member`                       | 用户到工作空间的成员关系与角色                        |
| `LogicalEntity`                | Evidence、Participant、Role 或 Context 类型的业务概念 |
| `LogicalRelationship`          | 同一工作区内两个逻辑实体之间的业务关系                |
| `Diagram`                      | 工作区逻辑模型的单一当前投影，固定 id 为 `model`      |
| `DiagramNode` / `DiagramEdge`  | 从实体及关联 YAML 投影出的图元素                      |
| `InboxItem` / `InboxRevision`  | 来源身份、状态与不可变内容快照                        |
| `InboxExtraction`              | 人工选择的 1–5 个精确 latest Revision                 |
| `InboxStoryCandidate`          | 无 Story ID、引用精确 Revision SHA 的 AI 提案         |
| `Iteration` / `Frozen Intake`  | Candidate claim、WIP、隔离 branch 与自包含快照        |
| `KickoffProposal` / `Decision` | Agent 替代提案与 append-only 人工权威                 |
| `Story` / `StoryRevision`      | Kickoff confirm 后的 `US-001`、不可变内容与 Scenario  |
| `CodingRun`                    | 锁定精确 Story Revision 的本地编码执行与人工决定      |

逻辑实体类型：

| 类型          | 用途             | 子类型                                                                                             |
| :------------ | :--------------- | :------------------------------------------------------------------------------------------------- |
| `EVIDENCE`    | 业务证据与文档   | `rfp`、`proposal`、`contract`、`fulfillment_request`、`fulfillment_confirmation`、`other_evidence` |
| `PARTICIPANT` | 参与者和事物     | `party`、`thing`                                                                                   |
| `ROLE`        | 参与者扮演的角色 | `party`、`domain`、`3rd system`、`context`、`evidence`                                             |
| `CONTEXT`     | 业务语义边界     | `bounded_context`                                                                                  |

核心规则：

- Workspace 创建时由 Server 分配私有 `modelRoot` 并初始化 `.evidence/entities` 和 `.evidence/associations`；HAL 不公开绝对路径。
- LogicalRelationship 的 source/target 必须引用同一工作区内存在的 LogicalEntity。
- Diagram 是文件模型的投影，不拥有第二套可变实体/关系集合。
- Candidate 不具权威且 selection 不创建 Story；只有人工 Kickoff `confirm` 可创建每轮唯一 `US-001`。
- CodingRun 必须锁定 latest 且至少含一个 Scenario 的 Story Revision；baseline Revision 不可编码。
- Coding Pi 不能自行接受变更、commit、merge 或 push；完整 diff 和本地路径不进入 Server。

### REST API 与契约

API 使用 HAL 风格 JSON：资源通过 `_links` 导航，集合使用 `_embedded`，分页使用 `page` 与 `pageSize`。

| 方法                   | 路径                                                                                   | 用途                                   |
| :--------------------- | :------------------------------------------------------------------------------------- | :------------------------------------- |
| GET                    | `/api`、`/health`、`/api/openapi.json`                                                 | API 根、健康检查与 OpenAPI             |
| GET                    | `/api/users/{userId}`、`/api/users/{userId}/sidebar`                                   | 用户与工作区导航                       |
| GET, POST              | `/api/users/{userId}/workspaces`                                                       | 查询/创建工作区                        |
| GET, PUT, DELETE       | `/api/users/{userId}/workspaces/{workspaceId}`                                         | 工作区 CRUD                            |
| GET, POST, DELETE      | `/api/users/{userId}/workspaces/{workspaceId}/members[/{memberId}]`                    | 成员管理                               |
| GET                    | `/api/workspaces/{workspaceId}/diagram[/nodes][/edges]`                                | 当前图投影                             |
| GET, POST, PATCH       | `/api/workspaces/{workspaceId}/inbox-items[/{itemId}]`                                 | Inbox 捕获、查询和状态                 |
| POST, GET              | `/api/workspaces/{workspaceId}/inbox-extractions[/{extractionId}]`                     | 冻结所选 Inbox Revision                |
| POST                   | `/api/workspaces/{workspaceId}/inbox-extractions/{extractionId}/candidates`            | Inbox Analyst 一次性提案               |
| GET                    | `/api/workspaces/{workspaceId}/story-candidates[/{candidateId}]`                       | Candidate 查询                         |
| POST                   | `/api/workspaces/{workspaceId}/story-candidates/{candidateId}/{defer,reject,select}`   | 人工决定与 Iteration admission         |
| GET, POST              | `/api/workspaces/{workspaceId}/iterations/{iterationId}/…`                             | Frozen Intake、provisioning 与 Kickoff |
| GET, POST              | `/api/workspaces/{workspaceId}/stories[/{storyId}]/revisions[/{revisionId}]`           | `US-001` 与不可变 Revision             |
| GET, POST              | `/api/workspaces/{workspaceId}/stories/{storyId}/coding-runs`                          | CodingRun 查询与创建                   |
| POST                   | `/api/workspaces/{workspaceId}/coding-runs/{runId}/{review,fail,cancel,accept,reject}` | CodingRun 显式状态命令                 |
| GET, POST, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-entities[/{entityId}]`                          | 逻辑实体 CRUD                          |
| GET, POST, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-relationships[/{relationshipId}]`               | 逻辑关系 CRUD                          |

Nest 拥有的 OpenAPI 源是 [`libs/server/api/openapi.yaml`](./libs/server/api/openapi.yaml)。`pnpm api:generate` 直接重新生成 Web client 类型；`pnpm api:check` 和本地 black-box contract runner 防止源码、客户端与运行时漂移。

### Desktop 安全与打包

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- preload 只暴露 API URL、目录选择、Workspace binding、本地建模/Inbox/Kickoff Agent、Iteration provisioner 和 CodingRun controller 的受限能力，且 main 校验 sender。
- Electron 启动前健康检查 `EVIDENCE_API_BASE_URL`；非 loopback endpoint 必须使用 HTTPS。
- 每个 CodingRun 创建独立 branch/worktree；完整 diff 只留本地，人工接受后创建单个 Conventional Commit。
- Web renderer、运行依赖和 Pi SDK 进入 electron-builder 包；Server 与数据库不会进入 Desktop 包，Server 也不加载 Pi SDK。
- package E2E 使用临时 PostgreSQL 与受控 fake Pi provider 验证完整 Inbox → revise → Kickoff confirm 生命周期及本地 CodingRun，且断言凭据和绝对路径不进入 Provider/Server。

## 数据库 Schema

Prisma PostgreSQL contract 由 persistence adapter 拥有：schema 位于
[`libs/server/persistent/prisma/schema.prisma`](./libs/server/persistent/prisma/schema.prisma)，版本化 migration
位于同目录的 `migrations/`。`apps/server/prisma.config.ts` 只负责把 Server 的部署环境和 Prisma CLI
连接到该 contract。

```sh
pnpm prisma:generate
pnpm prisma:migrate:deploy
```

生产部署只使用受版本控制的 `prisma migrate deploy`，不提供旧数据库格式的数据导入路径。

## Evidence Orchestrator

> **内部工具边界**：本节说明贡献者如何开发 Evidence，不属于产品能力、画像、旅程或 `.evidence` 产品领域模型。

Evidence Orchestrator 位于 `.pi/extensions/evidence-orchestrator/`。Extension 负责确定性状态、执行、路径保护和审计；`.pi/agents/` 定义隔离角色；`.pi/skills/` 承载 Complicated/Complex 方法；`.pi/prompts/` 承载 Clear 固定任务。人类始终担任 Navigator。

```mermaid
flowchart LR
  I[Inbox] --> C[Story candidates]
  C --> K[Frozen Intake / Kickoff]
  K --> U[Understand]
  U --> T[Tasking]
  T --> P[Pair]
  P --> S[Showcase]
  S --> R[Respond]
  R --> D[Complete]

  S -. product/domain gap .-> U
  S -. architecture/process gap .-> T
  S -. test/implementation gap .-> P
  U -. problem gap .-> K
```

Inbox 保存来源 revision 和未经确认的 Story 候选；每个 `ITER-xxxx` worktree 只处理一张人工确认 Story 及其完整 Scenario Set。稳定产品、模型、架构和工序统一维护，iteration 只保存输入、增量、决策与 append-only 执行证据。历史 iteration 不得重写。

常用 Pi 命令：

```text
/evidence-inbox
/evidence-inbox add github [owner/repository#123]
/evidence-inbox add text
/evidence-inbox add file <project-markdown-path>
/evidence-inbox extract INBOX-xxxx[,INBOX-yyyy]
/evidence-new CAND-xxxx
/evidence-flow list | pull ITER-xxxx | recover ITER-xxxx <reason> | archive ITER-xxxx <reason>
/evidence-status [ITER-xxxx [artifacts [cursor]]]
/evidence-answer ITER-xxxx Q-xxx <answer>
/evidence-run ITER-xxxx [--dry-run]
/evidence-kickoff ITER-xxxx confirm|revise|split|defer <reason>
/evidence-scenario ITER-xxxx confirm <DRAFT-xxx> <reason>
/evidence-modeling-profile ITER-xxxx confirm|revise <reason>
/evidence-model ITER-xxxx confirm|revise|scenario-gap|method-gap <reason>
/evidence-desk-check ITER-xxxx approve|revise|scenario-gap|architecture-gap|process-gap <reason>
/evidence-pair ITER-xxxx approve|back-test|back-implementation|back-tasking|retry-quality <reason>
/evidence-explain-diff ITER-xxxx
/evidence-showcase ITER-xxxx accept|revise|reject <reason>
/evidence-respond ITER-xxxx approve|revise <reason>
```

维护细节见 [`.pi/extensions/evidence-orchestrator/README.md`](./.pi/extensions/evidence-orchestrator/README.md)。

## 快速开始

### 环境要求

- Node.js 22+
- pnpm 10+
- Hosted 模式：PostgreSQL
- Desktop 打包：目标平台所需的 electron-builder 工具
- Orchestrator：Pi；GitHub source adapter 另需已认证的 `gh`

### 安装

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
cp apps/server/.env.example apps/server/.env
```

在 `apps/server/.env` 中设置 Server 运行时使用的 `DATABASE_URL`。如果运行时使用 transaction-mode
连接池，同时用 `DIRECT_URL` 配置 Prisma migration 的 session/direct 地址。该本地文件已被 Git 忽略。
迁移只通过 `pnpm prisma:migrate:deploy` 包装脚本执行；脚本会显示不含凭证的目标。自动化和一次性
迁移应显式设置 `EVIDENCE_MIGRATION_DATABASE_URL`。命令行显式设置的 `DATABASE_URL` 仍优先于
`.env` 中的 `DIRECT_URL`，避免临时数据库验证静默连接远程数据库。

### Browser + Hosted Server

```sh
# Terminal 1：首次或 schema 更新后先执行 migration
pnpm prisma:migrate:deploy
pnpm dev:server

# Terminal 2
pnpm dev:web
```

打开 `http://127.0.0.1:4200`。Vite 将 `/api` 和 `/health` 代理到 `127.0.0.1:3000`。

### Desktop

本地开发只需运行：

```sh
pnpm dev:desktop
```

Nx 会联动启动 Server、Web renderer 与 Electron，并为 Electron 设置本地 API 地址
`http://127.0.0.1:3000/api`。Server 从 `apps/server/.env` 读取数据库连接；Electron 会等待
Web 与 Server 健康检查通过后再启动。

连接已运行的远程 Server 时，使用：

```sh
EVIDENCE_API_BASE_URL=https://api.example.com/api \
EVIDENCE_API_AUTHORIZATION='Bearer ...' \
pnpm dev:desktop:remote
```

远程 endpoint 必须使用 HTTPS；只有 loopback endpoint 允许 HTTP。Desktop 主进程只向配置的
API origin/path 注入 `EVIDENCE_API_AUTHORIZATION`，不会通过 preload 把凭据交给 renderer。Browser
部署可用 `VITE_API_AUTHORIZATION` 配置其自身的短期访问凭据。

打包、smoke 与 deterministic Fake Provider E2E：

```sh
pnpm nx run @evidence/desktop:package-smoke
pnpm nx run @evidence/desktop:package-e2e
pnpm nx run @evidence/desktop:package
```

`package-e2e` 会启动真实 Server、一次性 PostgreSQL（未设置 `DATABASE_URL` 时通过 Docker
创建）和 OpenAI-compatible Fake Provider，并驱动 unpacked Desktop 验证接受、重启恢复、拒绝、
Provider 失败与超时流程。显式设置的数据库默认必须是 loopback 地址。

### Server 环境变量

| 变量                               | 默认值                   | 说明                                                                           |
| :--------------------------------- | :----------------------- | :----------------------------------------------------------------------------- |
| `DATABASE_URL`                     | Prisma 本地 fallback     | Server 运行时 PostgreSQL 连接字符串                                            |
| `DIRECT_URL`                       | `DATABASE_URL`           | Prisma migration 的 session/direct 地址；运行时使用 transaction pooler 时设置  |
| `EVIDENCE_MIGRATION_DATABASE_URL`  | 未设置                   | `pnpm prisma:migrate:deploy` 的显式单次目标，优先于其他数据库 URL              |
| `PORT`                             | `3000`                   | Nest 监听端口                                                                  |
| `EVIDENCE_HOST`                    | `127.0.0.1`              | Server 监听 host；非 loopback 时必须同时配置 API Authorization                 |
| `EVIDENCE_API_AUTHORIZATION`       | 未设置                   | 非 loopback Server 必需；请求必须携带完全一致的 `Authorization` header         |
| `EVIDENCE_CORS_ORIGINS`            | 本地 Web 与 Desktop      | Server 允许的逗号分隔 origin；仅显式 `*` 才允许所有                            |
| `EVIDENCE_USER_ID`                 | `desktop-user`           | 当前单用户部署 principal；只可访问其 Workspace membership                      |
| `EVIDENCE_USER_NAME`               | `Desktop User`           | 首次创建部署 principal 时使用的名称                                            |
| `EVIDENCE_USER_EMAIL`              | `desktop@evidence.local` | 首次创建部署 principal 时使用的邮箱                                            |
| `EVIDENCE_DEFAULT_WORKSPACE_PATH`  | 当前目录                 | 仅用于内置默认 Workspace 的 Server 模型根                                      |
| `EVIDENCE_WORKSPACE_STORAGE_ROOT`  | `tmp/workspace-models`   | Server 为新 Workspace 分配模型目录的私有根；不接收 Desktop 路径                |
| `PI_CODING_AGENT_DIR`              | `~/.pi/agent`            | Desktop Pi SDK 的模型、认证与全局设置目录                                      |
| `EVIDENCE_CODING_AGENT_TIMEOUT_MS` | `1800000`                | Desktop Coding Agent 超时；允许 `100`–`3600000` 毫秒                           |
| `EVIDENCE_USER_DATA_PATH`          | Electron 默认 userData   | Desktop 本地状态目录的绝对路径覆盖；主要用于隔离测试或受管部署                 |
| `VITE_API_BASE_URL`                | `/api`                   | Browser API 根                                                                 |
| `VITE_API_AUTHORIZATION`           | 未设置                   | Browser 自身的 Authorization；仅用于受控部署，不由 Desktop preload 提供        |
| `EVIDENCE_API_BASE_URL`            | Electron 必填            | Electron API 根；`dev:desktop` 自动设置本地值，非 loopback endpoint 必须 HTTPS |

## 常用命令

```sh
# Workspace
pnpm nx show projects
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Server
pnpm nx test @evidence/server --run
pnpm nx test @evidence/server-domain --run
pnpm nx test @evidence/server-api --run
pnpm nx test @evidence/server-persistent --run

# Desktop
pnpm nx test @evidence/desktop --run
pnpm nx run @evidence/desktop:package-smoke
pnpm nx run @evidence/desktop:package-e2e

# API
pnpm api:check
pnpm api:generate
# DATABASE_URL 必须指向已迁移的 loopback 临时 PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/evidence pnpm api:contracts
# 仅对明确的一次性远程测试库允许覆盖保护：
# EVIDENCE_ALLOW_REMOTE_CONTRACT_DATABASE=1 DATABASE_URL=... pnpm api:contracts

# Internal Orchestrator
pnpm orchestrator:test
pnpm orchestrator:validate
```

## 仓库地图

| 路径                                        | 用途                                                        |
| :------------------------------------------ | :---------------------------------------------------------- |
| `apps/web/`                                 | React + Vite 前端组合根                                     |
| `libs/web/*`                                | Web shell、features、UI 与 HAL API client                   |
| `apps/server/`                              | Nest/PostgreSQL 组合根与 Prisma 部署入口                    |
| `libs/server/api/`                          | Nest controllers、HAL 与 OpenAPI source                     |
| `libs/server/domain/`                       | 纯 TypeScript domain 与 ports                               |
| `libs/server/persistent/`                   | Prisma schema/migrations、PostgreSQL 与 filesystem adapters |
| `apps/desktop/`                             | Electron、local agents、CodingRun controller 与打包         |
| `libs/contracts/api-contracts/`             | 可执行 black-box API contracts                              |
| `docs/product/`                             | 跨迭代统一产品知识                                          |
| `.evidence/`                                | Evidence 平台权威领域模型                                   |
| `docs/architecture/`                        | 跨迭代统一架构与测试策略                                    |
| `engineering/evidence-orchestrator/`        | 内部 runtime contexts、测试工序与 DoD                       |
| `.pi/extensions/evidence-orchestrator/`     | 内部知识循环、状态保护与执行证据                            |
| `artifacts/inbox/`、`artifacts/iterations/` | 不可变来源及迭代证据                                        |
| `AGENTS.md`                                 | 架构边界、编码规范、验证与 Git 纪律                         |

## 开发约定

- `apps/web` 是唯一前端；Desktop 不创建第二套 React 页面。
- Nest 是唯一 Server runtime；Electron main/preload 不承载服务端业务规则。
- API 变化同步 OpenAPI source、发布契约、contract runner 和生成客户端。
- 新持久化行为同时考虑 memory/fake、PostgreSQL 和 filesystem 边界。
- 新项目使用 Nx generator；workspace 依赖使用 pnpm 和 `workspace:*` 正式链接。
- 提交前运行受影响项目的 test、typecheck、lint、build 及契约/打包门禁。

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
