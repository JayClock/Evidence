# Evidence

Evidence 是一个领域建模与证据映射平台，帮助领域专家和业务分析师定义业务概念，把证据、参与者、角色与上下文组织成可演进的逻辑模型，并通过关系图进行理解和评审。

产品有三个运行时界面：

- **Web**：React + Vite SPA；
- **Server**：NestJS + TypeScript，Hosted 模式默认使用 PostgreSQL；
- **Desktop**：Electron 壳，复用 Web renderer，并连接经过健康检查的 Server API。

仓库还包含项目本地的 **Evidence Orchestrator**，仅用于辅助当前仓库开发 Evidence。它不是面向用户的产品能力；边界决定见 [`engineering/evidence-orchestrator/product-boundary.md`](./engineering/evidence-orchestrator/product-boundary.md)。

[产品能力](#产品能力) · [产品架构](#产品架构) · [数据迁移](#数据迁移) · [Evidence Orchestrator](#evidence-orchestrator) · [快速开始](#快速开始) · [仓库地图](#仓库地图) · [AGENTS.md](./AGENTS.md)

## 产品能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **逻辑模型编写**：在工作区定义 `LogicalEntity` 与 `LogicalRelationship`。
3. **图投影**：`Diagram`、`DiagramNode` 和 `DiagramEdge` 展示逻辑模型；图元素不是第二份逻辑模型。
4. **AI 模型辅助**：AI Modeling Agent 可以提出流式 `ModelingProposal`，但必须由用户确认后才能改变权威模型。
5. **Web / Desktop 一致体验**：Electron 复用唯一的 React 前端和 REST/HAL 语义。
6. **一致的 Desktop**：打包 Web renderer 与 Pi SDK，并通过配置的 Server API 使用同一产品语义。

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
libs/server/api/                     controllers, HAL, SSE, OpenAPI
       ↓
libs/server/domain/                  framework-free entities and ports
       ↑
libs/server/persistent/              Prisma and filesystem adapters
libs/server/infrastructure/          Pi SDK adapter
```

Domain 不依赖 HTTP、Nest、Prisma、Electron 或 UI。Controller 只做协议转换和委托；runtime adapter wiring 只存在于 `apps/server`。

### 领域模型

| 聚合 / 概念                   | 说明                                                  |
| :---------------------------- | :---------------------------------------------------- |
| `User`                        | 用户身份以及可访问的工作空间                          |
| `Workspace`                   | 成员、逻辑模型、当前图与本地 `.evidence` 的协作边界   |
| `Member`                      | 用户到工作空间的成员关系与角色                        |
| `LogicalEntity`               | Evidence、Participant、Role 或 Context 类型的业务概念 |
| `LogicalRelationship`         | 同一工作区内两个逻辑实体之间的业务关系                |
| `Diagram`                     | 工作区逻辑模型的单一当前投影，固定 id 为 `model`      |
| `DiagramNode` / `DiagramEdge` | 从实体及关联 YAML 投影出的图元素                      |
| `ModelingProposal`            | AI Agent 提出的实体/关系变更建议，需用户确认          |

逻辑实体类型：

| 类型          | 用途             | 子类型                                                                                             |
| :------------ | :--------------- | :------------------------------------------------------------------------------------------------- |
| `EVIDENCE`    | 业务证据与文档   | `rfp`、`proposal`、`contract`、`fulfillment_request`、`fulfillment_confirmation`、`other_evidence` |
| `PARTICIPANT` | 参与者和事物     | `party`、`thing`                                                                                   |
| `ROLE`        | 参与者扮演的角色 | `party`、`domain`、`3rd system`、`context`、`evidence`                                             |
| `CONTEXT`     | 业务语义边界     | `bounded_context`                                                                                  |

核心规则：

- Workspace 创建时规范化并保存 `repositoryRoot` 与 `evidenceRoot`，初始化 `.evidence/entities` 和 `.evidence/associations`。
- LogicalRelationship 的 source/target 必须引用同一工作区内存在的 LogicalEntity。
- Diagram 是文件模型的投影，不拥有第二套可变实体/关系集合。
- AI 提案不能绕过用户确认直接修改权威模型。

### REST API 与契约

API 使用 HAL 风格 JSON：资源通过 `_links` 导航，集合使用 `_embedded`，分页使用 `page` 与 `pageSize`。

| 方法                   | 路径                                                                     | 用途                       |
| :--------------------- | :----------------------------------------------------------------------- | :------------------------- | ---------- |
| GET                    | `/api`、`/health`、`/api/openapi.json`                                   | API 根、健康检查与 OpenAPI |
| GET                    | `/api/users/{userId}`、`/api/users/{userId}/sidebar`                     | 用户与工作区导航           |
| GET, POST              | `/api/users/{userId}/workspaces`                                         | 查询/创建工作区            |
| GET, PUT, DELETE       | `/api/users/{userId}/workspaces/{workspaceId}`                           | 工作区 CRUD                |
| GET, POST, DELETE      | `/api/users/{userId}/workspaces/{workspaceId}/members[/{memberId}]`      | 成员管理                   |
| GET                    | `/api/workspaces/{workspaceId}/diagram[/nodes                            | /edges]`                   | 当前图投影 |
| POST (SSE)             | `/api/workspaces/{workspaceId}/diagram/propose-model`                    | 流式建模提案               |
| GET, POST, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-entities[/{entityId}]`            | 逻辑实体 CRUD              |
| GET, POST, PUT, DELETE | `/api/workspaces/{workspaceId}/logical-relationships[/{relationshipId}]` | 逻辑关系 CRUD              |

Nest 拥有的 OpenAPI 源是 [`libs/server/api/openapi.yaml`](./libs/server/api/openapi.yaml)。`pnpm api:generate` 直接重新生成 Web client 类型；`pnpm api:check` 和本地 black-box contract runner 防止源码、客户端与运行时漂移。

### Desktop 安全与打包

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- preload 只暴露 API URL、目录选择和本地建模 Agent 的受限能力，且 main 校验 sender。
- Electron 启动前健康检查 `EVIDENCE_API_BASE_URL`；非 loopback endpoint 必须使用 HTTPS。
- Web renderer、运行依赖和 Pi SDK 进入 electron-builder 包；Server 与数据库不会进入 Desktop 包。
- package smoke 使用受控 fake API 验证 renderer、远程 API readiness 和内嵌 Pi SDK。

## 数据迁移

### 旧 PostgreSQL → Prisma/YAML

迁移器只读取旧数据库，并要求使用不同的目标数据库。先创建并记录源备份，再对目标执行 Prisma baseline migration：

```sh
pnpm prisma:generate
DATABASE_URL="$TARGET_DATABASE_URL" \
  pnpm --filter @evidence/server exec prisma migrate deploy

SOURCE_DATABASE_URL="$SOURCE_DATABASE_URL" \
TARGET_DATABASE_URL="$TARGET_DATABASE_URL" \
SOURCE_BACKUP_ID="backup-2026-07-20" \
EVIDENCE_MIGRATION_MODEL_ROOT="$PWD/migrated-workspaces" \
EVIDENCE_MIGRATION_MANIFEST="$PWD/migration-manifest.json" \
EVIDENCE_MIGRATION_DRY_RUN=1 \
  pnpm nx run @evidence/server:migrate-postgres
```

移除 `EVIDENCE_MIGRATION_DRY_RUN=1` 才写入目标 registry 和 YAML。迁移会校验引用、owner、重复成员和关系端点，记录 counts、源数据 hash、模型 hash、跳过项与工具版本。回滚方式是停止切换并丢弃独立目标数据库/模型目录，再从源备份重建；不要原地覆盖旧数据库。

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
```

### Browser + Hosted Server

```sh
# Terminal 1：首次或 schema 更新后先执行 migration
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/evidence \
  pnpm --filter @evidence/server exec prisma migrate deploy

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/evidence \
  pnpm dev:server

# Terminal 2
pnpm dev:web
```

打开 `http://127.0.0.1:4200`。Vite 将 `/api` 和 `/health` 代理到 `127.0.0.1:3000`。

### Desktop

先启动上述 Server，再运行：

```sh
EVIDENCE_API_BASE_URL=http://127.0.0.1:3000/api pnpm dev:desktop
```

Electron 启动 Web renderer 与嵌入式 Pi runtime，并连接配置的 API。非 loopback 环境必须使用 HTTPS。

打包与 smoke：

```sh
pnpm nx run @evidence/desktop:package-smoke
pnpm nx run @evidence/desktop:package
```

### Server 环境变量

| 变量                              | 默认值               | 说明                                             |
| :-------------------------------- | :------------------- | :----------------------------------------------- |
| `DATABASE_URL`                    | Prisma 本地 fallback | PostgreSQL 连接字符串                            |
| `PORT`                            | `3000`               | Nest 监听端口                                    |
| `EVIDENCE_HOST`                   | Nest 默认            | 显式监听 host                                    |
| `EVIDENCE_CORS_ORIGINS`           | 允许所有             | Server 允许的逗号分隔 origin                     |
| `EVIDENCE_DEFAULT_WORKSPACE_PATH` | 当前目录             | 默认 Workspace 根                                |
| `PI_CODING_AGENT_DIR`             | `~/.pi/agent`        | Pi SDK 的模型、认证与全局设置目录                |
| `VITE_API_BASE_URL`               | `/api`               | Browser API 根                                   |
| `EVIDENCE_API_BASE_URL`           | 必填                 | Electron API 根；非 loopback endpoint 必须 HTTPS |

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
pnpm nx test @evidence/server-infrastructure --run

# Desktop
pnpm nx test @evidence/desktop --run
pnpm nx run @evidence/desktop:package-smoke

# API
pnpm api:check
pnpm api:generate
# DATABASE_URL 必须指向已迁移的临时 PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/evidence pnpm api:contracts

# Internal Orchestrator
pnpm orchestrator:test
pnpm orchestrator:validate
```

## 仓库地图

| 路径                                        | 用途                                                  |
| :------------------------------------------ | :---------------------------------------------------- |
| `apps/web/`                                 | React + Vite 前端组合根                               |
| `libs/web/*`                                | Web shell、features、UI 与 HAL API client             |
| `apps/server/`                              | Nest/PostgreSQL 组合根、Prisma 与迁移入口             |
| `libs/server/api/`                          | Nest controllers、HAL/SSE 与 OpenAPI source           |
| `libs/server/domain/`                       | 纯 TypeScript domain 与 ports                         |
| `libs/server/persistent/`                   | PostgreSQL 与 filesystem adapters                     |
| `libs/server/infrastructure/`               | Pi SDK adapter                                        |
| `apps/desktop/`                             | Electron main/preload、remote API bridge 与 packaging |
| `libs/contracts/api-contracts/`             | 可执行 black-box API contracts                        |
| `docs/product/`                             | 跨迭代统一产品知识                                    |
| `.evidence/`                                | Evidence 平台权威领域模型                             |
| `docs/architecture/`                        | 跨迭代统一架构与测试策略                              |
| `engineering/evidence-orchestrator/`        | 内部 runtime contexts、测试工序与 DoD                 |
| `.pi/extensions/evidence-orchestrator/`     | 内部知识循环、状态保护与执行证据                      |
| `artifacts/inbox/`、`artifacts/iterations/` | 不可变来源及迭代证据                                  |
| `AGENTS.md`                                 | 架构边界、编码规范、验证与 Git 纪律                   |

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
