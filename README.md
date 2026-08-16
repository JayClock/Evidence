# Evidence

Evidence 是一个领域建模与证据映射平台，帮助领域专家和业务分析师定义业务概念，把证据、参与者、角色与上下文组织成可演进的逻辑模型，并通过关系图进行理解和评审。

产品有三个运行时界面：

- **Web**：React + Vite SPA；
- **Server**：Java + Spring Boot/Jersey，Hosted 模式使用 PostgreSQL；
- **Desktop**：Electron 壳，复用 Web renderer，并连接经过健康检查的 Server API。

[产品能力](#产品能力) · [产品架构](#产品架构) · [数据库-schema](#数据库-schema) · [快速开始](#快速开始) · [仓库地图](#仓库地图) · [AGENTS.md](./AGENTS.md)

## 产品能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **Work Intake**：保存 Inbox Item、不可变来源 Revision，并由人类选择 1–5 个来源冻结 Extraction。
3. **Iteration / Kickoff**：本地 Inbox Analyst 提案后由人类 admission；Server 冻结 Intake，Desktop provision worktree，人工 Kickoff confirm 才创建 `US-001`。
4. **Understand / Tasking**：通过 TQA 确认 Scenario Set 与模型处置，再由人工 Desk Check 批准精确测试和任务计划。
5. **本地 AI 辅助建模**：Desktop 嵌入 Pi SDK，通过受限工具和 Server REST API 读取、修改逻辑模型。
6. **Pair 编码与人工批准**：Desktop 在隔离 worktree 中运行短生命周期 Driver、独立 Red Review、锁定命令和质量门；人工批准完整 Story diff 后才创建本地 commit。
7. **Showcase / Respond**：重新执行全部 Q2、记录实际产品观察并独立 Review；人工接受价值后才提出知识响应和 next Probe。
8. **Web / Desktop 一致体验**：Electron 复用唯一的 React 前端和 REST/HAL 语义。

## 产品架构

### Runtime 拓扑

```text
Browser
  └─ apps/web + libs/web/*                       React + Vite :4200
       └─ REST / HAL
            └─ apps/server-java + libs/server-java/*
                 ├─ Spring Boot/Jersey :3000
                 ├─ MyBatis + Flyway → PostgreSQL
                 └─ workspace/.evidence YAML model

Electron
  └─ apps/desktop                            secure main/preload
       ├─ packaged apps/web renderer
       ├─ embedded Pi SDK role runtimes
       └─ REST / HAL → configured Server API
```

- `apps/web` 是唯一前端组合根，功能与 API client 位于 `libs/web/*`。
- Java Server 是唯一生产 Server 组合根；Nest 仅在退役前用于 rollback/parity，不接收默认流量。
- Server 使用 PostgreSQL registry；Desktop 不打包第二个 Server 或数据库。
- Web 与 Electron renderer 都消费 REST/HAL；Electron IPC 不复制业务 API。
- 打包 renderer 使用受保护的 `evidence://app/` 协议。开发 renderer 默认使用 `http://127.0.0.1:4200`。
- Electron 必须通过 `EVIDENCE_API_BASE_URL=https://…/api` 连接 API；开发时允许 loopback HTTP。

### Server 分层

```text
apps/server-java/                    Spring Boot composition root
       ↓
libs/server-java/api/                JAX-RS, HAL, OpenAPI adapter
       ↓
libs/server-java/application/        use cases and transactions
       ↓
libs/server-java/domain/             framework-free entities and ports
       ↑
libs/server-java/persistent/         MyBatis, Flyway and filesystem adapters
```

Domain 不依赖 HTTP、Spring、MyBatis、Electron 或 UI。JAX-RS resource 只做协议转换和委托；事务边界位于 application，runtime adapter wiring 只存在于 `apps/server-java`。

### 领域模型

| 聚合 / 概念                            | 说明                                                  |
| :------------------------------------- | :---------------------------------------------------- |
| `User`                                 | 用户身份以及可访问的工作空间                          |
| `Workspace`                            | 成员、逻辑模型、当前图与本地 `.evidence` 的协作边界   |
| `Member`                               | 用户到工作空间的成员关系与角色                        |
| `LogicalEntity`                        | Evidence、Participant、Role 或 Context 类型的业务概念 |
| `LogicalRelationship`                  | 同一工作区内两个逻辑实体之间的业务关系                |
| `Diagram`                              | 工作区逻辑模型的单一当前投影，固定 id 为 `model`      |
| `DiagramNode` / `DiagramEdge`          | 从实体及关联 YAML 投影出的图元素                      |
| `InboxItem` / `InboxRevision`          | 来源身份、状态与不可变内容快照                        |
| `InboxExtraction`                      | 人工选择的 1–5 个精确 latest Revision                 |
| `InboxStoryCandidate`                  | 无 Story ID、引用精确 Revision SHA 的 AI 提案         |
| `Iteration` / `Frozen Intake`          | Candidate claim、WIP、隔离 branch 与自包含快照        |
| `KickoffProposal` / `Decision`         | Agent 替代提案与 append-only 人工权威                 |
| `Story` / `StoryRevision`              | Kickoff confirm 后的 `US-001`、不可变内容与 Scenario  |
| `ApprovedTaskingPlan` / `PairRun`      | Desk Check 锁定计划、逐 TEST 执行与人工编码批准       |
| `ShowcaseRun` / `ShowcaseDecision`     | fresh Q2、产品观察、独立 Review 与人工价值决定        |
| `RespondCandidate` / `RespondDecision` | 经验证知识响应、next Probe 与人工确认                 |

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
- Pair 只能从人工 Desk Check 批准的精确 Tasking Plan 启动；baseline Story Revision 不可编码。
- Pair Driver 和 Controller 不能自行接受变更、commit、merge 或 push；完整 diff、源码和本地路径不进入 Server。
- Pair 人工批准后才创建 Showcase；只有人工接受 Showcase 才进入 Respond。

### REST API 与契约

API 使用 HAL 风格 JSON：资源通过 `_links` 导航，集合使用 `_embedded`，分页使用 `page` 与 `pageSize`。

| 方法                   | 路径                                                                                  | 用途                                 |
| :--------------------- | :------------------------------------------------------------------------------------ | :----------------------------------- |
| GET                    | `/api`、`/health`、`/api/openapi.json`                                                | API 根、健康检查与 OpenAPI           |
| GET                    | `/api/users/{userId}`、`/api/users/{userId}/sidebar`                                  | 用户与工作区导航                     |
| GET, POST              | `/api/users/{userId}/workspaces`                                                      | 查询/创建工作区                      |
| GET, PUT, DELETE       | `/api/users/{userId}/workspaces/{workspaceId}`                                        | 工作区 CRUD                          |
| GET, POST, DELETE      | `/api/users/{userId}/workspaces/{workspaceId}/members[/{memberId}]`                   | 成员管理                             |
| GET                    | `/api/workspaces/{workspaceId}/diagram[/nodes][/edges]`                               | 当前图投影                           |
| GET, POST, PATCH       | `/api/workspaces/{workspaceId}/inbox-items[/{itemId}]`                                | Inbox 捕获、查询和状态               |
| POST, GET              | `/api/workspaces/{workspaceId}/inbox-extractions[/{extractionId}]`                    | 冻结所选 Inbox Revision              |
| POST                   | `/api/workspaces/{workspaceId}/inbox-extractions/{extractionId}/candidates`           | Inbox Analyst 一次性提案             |
| GET                    | `/api/workspaces/{workspaceId}/story-candidates[/{candidateId}]`                      | Candidate 查询                       |
| POST                   | `/api/workspaces/{workspaceId}/story-candidates/{candidateId}/{defer,reject,select}`  | 人工决定与 Iteration admission       |
| GET                    | `/api/workspaces/{workspaceId}/iterations/{iterationId}[/{intake,kickoff}]`           | Iteration、Frozen Intake 与 Kickoff  |
| POST                   | `/api/workspaces/{workspaceId}/iterations/{iterationId}/provisioning/{complete,fail}` | Desktop provisioning 结果            |
| GET, POST              | `/api/workspaces/{workspaceId}/iterations/{iterationId}/understanding[...]`           | TQA、Scenario 与模型处置             |
| GET, POST              | `/api/workspaces/{workspaceId}/iterations/{iterationId}/tasking[...]`                 | Tasking、Desk Check 与 Approved Plan |
| GET, POST              | `/api/workspaces/{workspaceId}/iterations/{iterationId}/pair[...]`                    | Pair nextAction、证据、异常与审批    |
| GET, POST              | `/api/workspaces/{workspaceId}/iterations/{iterationId}/showcase[...]`                | Q2、产品观察、Review 与价值决定      |
| GET, POST              | `/api/workspaces/{workspaceId}/iterations/{iterationId}/respond[...]`                 | 知识响应 Candidate 与人工决定        |
| GET                    | `/api/workspaces/{workspaceId}/stories[/{storyId}]`                                   | 权威 `US-001` Story                  |
| GET                    | `/api/workspaces/{workspaceId}/stories/{storyId}/revisions[/{revisionId}]`            | 不可变 Story Revision                |
| GET, POST, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-entities[/{entityId}]`                         | 逻辑实体 CRUD                        |
| GET, POST, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-relationships[/{relationshipId}]`              | 逻辑关系 CRUD                        |

语言无关的 OpenAPI 源是 [`libs/server/api/openapi.yaml`](./libs/server/api/openapi.yaml)，该路径在 Nest 退役前保持稳定。`pnpm api:generate` 直接重新生成 Web client 类型；`pnpm api:check` 和本地 black-box contract runner 防止源码、客户端与 Java 运行时漂移。

### Desktop 安全与打包

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- preload 只暴露 API URL、目录选择、Workspace binding，以及 Diagram、Inbox、Iteration 和各 Delivery Loop 所需的最小本地能力；main 对每次 IPC 调用校验 sender。
- Electron 启动前健康检查 `EVIDENCE_API_BASE_URL`；非 loopback endpoint 必须使用 HTTPS。
- Candidate selection 为该 Story provision 独立 branch/worktree；Pair、Showcase 与 Respond 复用这一隔离边界。
- 完整源码、diff、命令输出、Prompt、Pi 消息和绝对路径只留本地；人工编码批准会重新校验 diff hash 后创建单个 Conventional Commit，不自动 merge/push。
- Web renderer、运行依赖和 Pi SDK 进入 electron-builder 包；Server 与数据库不会进入 Desktop 包，Server 也不加载 Pi SDK。
- package smoke 验证 packaged renderer、受限 preload、嵌入 Pi SDK 和远程 API readiness。

## 数据库 Schema

迁移期 PostgreSQL contract 继续由 [`libs/server/persistent/prisma/schema.prisma`](./libs/server/persistent/prisma/schema.prisma) 和同目录的版本化 SQL migrations 记录。Java persistence build 将这些 SQL 打包为 Flyway migrations；Java Server 启动时执行校验和升级。Nest rollback 仍可使用受保护的 `pnpm prisma:migrate:deploy`，不得运行未受版本控制的 schema push。

## 快速开始

### 环境要求

- Java 17+
- Node.js 22+
- pnpm 10+
- Hosted 模式：PostgreSQL
- Desktop 打包：目标平台所需的 electron-builder 工具

### 安装

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
cp apps/server/.env.example apps/server/.env
```

迁移窗口内 `pnpm dev:server` 会读取已被 Git 忽略的 `apps/server/.env`，并将其中的 `DATABASE_URL` 传给 Java Server；部署环境应直接提供环境变量。若 rollback migration 使用 transaction-mode 连接池，可用 `DIRECT_URL` 提供 session/direct 地址。一次性旧迁移仍只通过 `pnpm prisma:migrate:deploy` 执行；Java Server 自身使用打包后的 Flyway migrations。

### Browser + Hosted Server

```sh
# Terminal 1：Java Server 启动时通过 Flyway 校验并升级 schema
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
API origin/path 注入 `EVIDENCE_API_AUTHORIZATION`，不会通过 preload 把凭据交给 renderer。
该静态凭据用于本地或受管 Desktop 兼容模式；Browser Hosted 部署使用下面的 OIDC 流程。

### Hosted 多用户 OIDC

Server 验证面向 Evidence API 的 JWT Access Token，并以 OIDC `(issuer, subject)` 映射稳定的内部
`User.id`。首次登录默认创建内部 User；设为 `EVIDENCE_OIDC_AUTO_PROVISION=false` 可要求管理员先建立映射。

```sh
EVIDENCE_AUTH_MODE=oidc \
EVIDENCE_OIDC_ISSUER=https://identity.example.com \
EVIDENCE_OIDC_AUDIENCE=evidence-api \
EVIDENCE_HOST=0.0.0.0 \
pnpm dev:server
```

Web 使用 Authorization Code + PKCE；身份提供商需要登记同源回调
`https://app.example.com/auth/callback`：

```sh
VITE_OIDC_AUTHORITY=https://identity.example.com \
VITE_OIDC_CLIENT_ID=evidence-web \
VITE_API_BASE_URL=https://api.example.com/api \
pnpm dev:web
```

Access Token 保存在 `sessionStorage`，不会写入 `localStorage`；API client 在每次请求时读取当前 Token。
Workspace 访问先验证 membership，再按 `owner`、`member`、`viewer` 执行管理、读写或只读授权。

打包与 unpacked smoke：

```sh
pnpm nx run @evidence/desktop:package-smoke
pnpm nx run @evidence/desktop:package
```

`package-smoke` 构建 Web 与 Desktop、生成 unpacked Electron 包，并通过受控 fake API 验证 packaged renderer、受限 preload、嵌入 Pi SDK 和 API readiness。

### 运行时环境变量

| 变量                                 | 默认值                   | 说明                                                                           |
| :----------------------------------- | :----------------------- | :----------------------------------------------------------------------------- |
| `DATABASE_URL`                       | 本地 PostgreSQL fallback | Java Server 运行时 PostgreSQL 连接字符串                                       |
| `DIRECT_URL`                         | `DATABASE_URL`           | 仅供退役前 Prisma rollback migration 使用的 session/direct 地址                |
| `EVIDENCE_MIGRATION_DATABASE_URL`    | 未设置                   | 退役前 `pnpm prisma:migrate:deploy` 的显式单次目标                             |
| `PORT`                               | `3000`                   | Java Server 监听端口                                                           |
| `EVIDENCE_HOST`                      | `127.0.0.1`              | Server 监听 host；非 loopback 必须使用 OIDC 或配置本地模式 Authorization       |
| `EVIDENCE_AUTH_MODE`                 | `local`                  | `local` 单用户兼容模式或 `oidc` 多用户模式                                     |
| `EVIDENCE_API_AUTHORIZATION`         | 未设置                   | `local` 模式的可选静态 Authorization；非 loopback 时必需                       |
| `EVIDENCE_OIDC_ISSUER`               | 未设置                   | `oidc` 模式必需；Access Token 的精确 HTTPS issuer                              |
| `EVIDENCE_OIDC_AUDIENCE`             | 未设置                   | `oidc` 模式必需；Evidence API audience                                         |
| `EVIDENCE_OIDC_JWKS_URI`             | Discovery                | 可选显式 JWKS URL；默认读取 issuer 的 OIDC discovery                           |
| `EVIDENCE_OIDC_AUTO_PROVISION`       | `true`                   | 是否在可信 issuer 的用户首次登录时创建内部 User                                |
| `EVIDENCE_CORS_ORIGINS`              | 本地 Web 与 Desktop      | Server 允许的逗号分隔 origin；仅显式 `*` 才允许所有                            |
| `EVIDENCE_USER_ID`                   | `desktop-user`           | 仅 `local` 模式使用的部署 principal                                            |
| `EVIDENCE_USER_NAME`                 | `Desktop User`           | `local` 模式首次创建 principal 时使用的名称                                    |
| `EVIDENCE_USER_EMAIL`                | `desktop@evidence.local` | `local` 模式首次创建 principal 时使用的邮箱                                    |
| `EVIDENCE_DEFAULT_WORKSPACE_PATH`    | 当前目录                 | 仅用于内置默认 Workspace 的 Server 模型根                                      |
| `EVIDENCE_WORKSPACE_STORAGE_ROOT`    | `tmp/workspace-models`   | Server 为新 Workspace 分配模型目录的私有根；不接收 Desktop 路径                |
| `PI_CODING_AGENT_DIR`                | `~/.pi/agent`            | Desktop Pi SDK 的模型、认证与全局设置目录                                      |
| `EVIDENCE_USER_DATA_PATH`            | Electron 默认 userData   | Desktop 本地状态目录的绝对路径覆盖；主要用于隔离测试或受管部署                 |
| `VITE_API_BASE_URL`                  | `/api`                   | Browser API 根                                                                 |
| `VITE_API_AUTHORIZATION`             | 未设置                   | Browser `local` 兼容模式的静态 Authorization                                   |
| `VITE_OIDC_AUTHORITY`                | 未设置                   | Browser OIDC authority；与 client id 同时设置                                  |
| `VITE_OIDC_CLIENT_ID`                | 未设置                   | Browser 公共 PKCE client id                                                    |
| `VITE_OIDC_SCOPE`                    | `openid profile email`   | Browser OIDC scopes；必须包含 `openid`                                         |
| `VITE_OIDC_REDIRECT_URI`             | 同源 `/auth/callback`    | 身份提供商登记的绝对同源回调 URL                                               |
| `VITE_OIDC_POST_LOGOUT_REDIRECT_URI` | 应用 origin              | 身份提供商登记的绝对同源退出回调 URL                                           |
| `EVIDENCE_API_BASE_URL`              | Electron 必填            | Electron API 根；`dev:desktop` 自动设置本地值，非 loopback endpoint 必须 HTTPS |

## 常用命令

```sh
# Workspace
pnpm nx show projects
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Java Server
pnpm nx run @evidence/server:test
pnpm nx run @evidence/server:build

# Desktop
pnpm nx test @evidence/desktop --run
pnpm nx run @evidence/desktop:package-smoke

# API
pnpm api:check
pnpm api:generate
# DATABASE_URL 必须指向已迁移的 loopback 临时 PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/evidence pnpm api:contracts
# 退役前显式验证 Java/Nest rollback parity：
# DATABASE_URL=... pnpm api:contracts:parity
# 仅对明确的一次性远程测试库允许覆盖保护：
# EVIDENCE_ALLOW_REMOTE_CONTRACT_DATABASE=1 DATABASE_URL=... pnpm api:contracts
```

## 仓库地图

| 路径                            | 用途                                                     |
| :------------------------------ | :------------------------------------------------------- |
| `apps/web/`                     | React + Vite 前端组合根                                  |
| `libs/web/*`                    | Web shell、features、UI 与 HAL API client                |
| `apps/server-java/`             | 生产 Spring Boot/Jersey 组合根                           |
| `libs/server-java/domain/`      | Smart Domain 领域模型与 ports                            |
| `libs/server-java/application/` | Use cases、事务与授权编排                                |
| `libs/server-java/api/`         | JAX-RS、HAL 和 HTTP adapter                              |
| `libs/server-java/persistent/`  | MyBatis/PostgreSQL、Flyway 和 filesystem adapters        |
| `apps/server/`、`libs/server/*` | 退役前保留的 Nest rollback/parity 实现                   |
| `apps/desktop/`                 | Electron、local agents、Delivery Loop controllers 与打包 |
| `libs/contracts/api-contracts/` | 可执行 black-box API contracts                           |
| `docs/product/`                 | 跨迭代统一产品知识                                       |
| `.evidence/`                    | Evidence 平台权威领域模型                                |
| `docs/architecture/`            | 跨迭代统一架构与测试策略                                 |
| `AGENTS.md`                     | 架构边界、编码规范、验证与 Git 纪律                      |

## 开发约定

- `apps/web` 是唯一前端；Desktop 不创建第二套 React 页面。
- Java 是唯一生产 Server runtime；Electron main/preload 不承载服务端业务规则。
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
