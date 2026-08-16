# Evidence 仓库指南

Evidence 是一个领域建模与证据映射平台，具有三个产品运行时界面：

- **Web**：`apps/web/` 中的 React + Vite SPA，复用 `libs/web/*`。
- **Server**：`apps/server-java/` 中的 Spring Boot 组合根，实现在 `libs/server-java/*`。
- **Desktop**：`apps/desktop/` 中的 Electron 壳；复用同一个 Web renderer，并连接经过健康检查的 Server API。

## 运行时拓扑

```text
Browser
  └─ apps/web + libs/web/*                  React/Vite :4200
       └─ REST/HAL
            └─ apps/server-java             Spring Boot/Jersey :3000
                 ├─ MyBatis + Flyway → PostgreSQL
                 ├─ workspace registry
                 └─ workspace/.evidence YAML model

Electron
  └─ apps/desktop                           main + restricted preload
       ├─ packaged apps/web renderer
       ├─ embedded Pi SDK agent
       └─ REST/HAL → configured Server API
```

- Web 与 Desktop 必须共享 REST/HAL 和领域语义；不得通过 Electron IPC 复制业务 API。
- Java Server 是唯一生产 Server 组合根；`apps/server/` 与 `libs/server/*` 仅在退役前用于 Nest rollback/parity，不得接收新能力或默认流量。
- Server 使用 PostgreSQL registry 和 Server 私有 `.evidence` 文件模型；不存在 Desktop 专用数据库或第二个生产组合根。
- Electron 必须设置 `EVIDENCE_API_BASE_URL`，并在启动时健康检查远程 HTTPS API；开发时允许 loopback HTTP。
- Desktop renderer 只通过受限 preload 取得 API URL、目录选择/Workspace binding 和本地 Agent 能力；业务 command/query 始终走 Server API。

## 服务端分层

| 层               | 路径                                                      | 职责                                                    |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| Composition root | `apps/server-java/src/main/java/`                         | Spring Boot bootstrap、runtime config 与 adapter wiring |
| API              | `libs/server-java/api/src/main/java/`                     | JAX-RS、请求解析、HAL 序列化与 vendor media type        |
| Application      | `libs/server-java/application/src/main/java/`             | Use case、事务边界与授权编排                            |
| Domain           | `libs/server-java/domain/src/main/java/`                  | 纯 Java 领域对象、port 与规则                           |
| Persistence      | `libs/server-java/persistent/src/main/java/`              | MyBatis/PostgreSQL 与 `.evidence` 文件 adapter          |
| Security         | `libs/server-java/infrastructure/security/src/main/java/` | local/OIDC authentication adapter                       |

依赖方向必须保持：API → application → domain，persistence/security 实现内层 port，composition root 负责组装。Domain 不得依赖 Spring、MyBatis、Jackson、HTTP 或 Electron。JAX-RS resource 只负责协议转换与委托；事务和工作流编排进入 application，业务规则进入 domain。

### 核心领域抽象

- `Entity`：提供 `identity()` 与 `description()`。
- `HasOne<T>` / `HasMany<T>`：聚合关系的最窄读取接口。
- `Ref<T>`：跨实体引用。
- `DomainError`：统一表达 not found、validation、conflict 和 internal 错误。

### 领域聚合

| 聚合 / 概念                            | 说明                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `User`                                 | 用户身份及可访问工作空间                              |
| `Workspace`                            | 成员、当前图、逻辑模型和 `.evidence` 根的协作边界     |
| `Member`                               | 用户到工作空间的成员关系与角色                        |
| `LogicalEntity`                        | Evidence、Participant、Role 或 Context 类型的业务概念 |
| `LogicalRelationship`                  | 同一工作空间内两个逻辑实体之间的关系                  |
| `Diagram`                              | 工作空间逻辑模型的单一当前投影，固定 id 为 `model`    |
| `DiagramNode` / `DiagramEdge`          | 从 `.evidence` 实体和关联投影出的图元素               |
| `InboxItem` / `InboxRevision`          | 来源身份、处理状态和不可变内容快照                    |
| `InboxExtraction`                      | 人工选择的 1–5 个精确 latest Revision                 |
| `InboxStoryCandidate`                  | Inbox Analyst 提出的精确引用、无 Story ID 的提案      |
| `Iteration` / `IterationIntake`        | Candidate claim、WIP 与自包含 Frozen Intake           |
| `KickoffProposal` / `KickoffDecision`  | 替代提案与 append-only 人工权威决定                   |
| `Story` / `StoryRevision`              | Kickoff confirm 后的 US-001 与不可变权威修订          |
| `ApprovedTaskingPlan` / `PairRun`      | Desk Check 锁定计划、逐 TEST 执行及人工编码审批       |
| `ShowcaseRun` / `ShowcaseDecision`     | fresh Q2、产品观察、风险评价、独立 Review 与价值决定  |
| `RespondCandidate` / `RespondDecision` | accepted Showcase 的知识响应、next Probe 与人工确认   |

Candidate selection 只能原子创建一轮 `Iteration + Frozen Intake`，不能创建 Story。只有该 Iteration 的人工 Kickoff `confirm` 可以创建唯一 `US-001`、Problem Statement、Lean Story Card 和不可编码的 baseline Story Revision；确认 Scenario 后仍须完成模型处置与人工 Desk Check，只有 Approved Tasking Plan 可以启动 Pair。Pair 人工批准原子创建 Showcase Attempt；只有人工 Showcase accept 可以进入 Respond，只有人工批准精确 Respond Candidate 才完成本轮。`revise` 只能按 Server 定义的知识缺口路由并保留旧证据；`split/defer/stop` 不得创建 Story。Workspace 创建或导入时必须初始化 Server 私有 `modelRoot/.evidence/{entities,associations}`；HAL metadata 不得包含 Server 或 Desktop 绝对路径。Desktop repositoryRoot 只保存在以 API + Workspace 为键的本地 binding store。逻辑关系的 source/target 必须属于同一工作空间且均存在。

## REST/OpenAPI

API 使用 HAL 风格 JSON：资源包含 `_links`，集合使用 `_embedded`，分页使用 `page` 与 `pageSize`。

- 语言无关的 OpenAPI 源文件：`libs/server/api/openapi.yaml`；该路径在 Nest 退役前保持稳定。
- 生成的 Web 类型：`libs/web/api-client/src/lib/openapi-schema.ts`。
- 修改 API 时必须同步实现、OpenAPI、black-box contract tests 和生成客户端。

主要路由：

| 路由                                                                          | 方法                   | 说明                                |
| ----------------------------------------------------------------------------- | ---------------------- | ----------------------------------- |
| `/api`、`/health`、`/api/openapi.json`                                        | GET                    | 根、健康检查和 OpenAPI              |
| `/api/users/{userId}`                                                         | GET                    | 用户资源                            |
| `/api/users/{userId}/sidebar`                                                 | GET                    | 工作空间导航投影                    |
| `/api/users/{userId}/workspaces`                                              | GET、POST              | 查询/创建工作空间                   |
| `/api/users/{userId}/workspaces/{workspaceId}`                                | GET、PUT、DELETE       | 工作空间 CRUD                       |
| `/api/users/{userId}/workspaces/{workspaceId}/members`                        | GET、POST              | 查询/添加成员                       |
| `/api/users/{userId}/workspaces/{workspaceId}/members/{memberId}`             | DELETE                 | 移除成员                            |
| `/api/workspaces/{workspaceId}/diagram`                                       | GET                    | 单一当前图                          |
| `/api/workspaces/{workspaceId}/diagram/nodes[/{nodeId}]`                      | GET                    | 图节点投影                          |
| `/api/workspaces/{workspaceId}/diagram/edges[/{edgeId}]`                      | GET                    | 图边投影                            |
| `/api/workspaces/{workspaceId}/inbox-items[/{itemId}]`                        | GET、POST、PATCH       | Inbox 捕获、查询和状态              |
| `/api/workspaces/{workspaceId}/inbox-items/{itemId}/revisions[/{id}]`         | GET、POST              | 不可变 Inbox Revision               |
| `/api/workspaces/{workspaceId}/inbox-extractions[/{extractionId}]`            | POST、GET              | 冻结所选 Inbox Revision             |
| `/api/workspaces/{workspaceId}/inbox-extractions/{id}/candidates`             | POST                   | Agent 一次性提议 Candidate          |
| `/api/workspaces/{workspaceId}/story-candidates[/{candidateId}]`              | GET                    | Candidate 查询                      |
| `/api/workspaces/{workspaceId}/story-candidates/{id}/{defer,reject,select}`   | POST                   | 人工 Candidate 决定与 admission     |
| `/api/workspaces/{workspaceId}/iterations/{iterationId}[/{intake,kickoff}]`   | GET                    | Iteration、Frozen Intake 与 Kickoff |
| `/api/workspaces/{workspaceId}/iterations/{id}/provisioning/{complete,fail}`  | POST                   | Desktop provisioning 结果           |
| `/api/workspaces/{workspaceId}/iterations/{id}/kickoff/{proposals,decisions}` | POST                   | Agent 替代提案与人工 Kickoff 决定   |
| `/api/workspaces/{workspaceId}/iterations/{id}/understanding[...]`            | GET、POST              | TQA、Scenario Proposal 与人工决定   |
| `/api/workspaces/{workspaceId}/iterations/{id}/tasking[...]`                  | GET、POST              | 模型处置、Tasking 与 Desk Check     |
| `/api/workspaces/{workspaceId}/iterations/{id}/pair[...]`                     | GET、POST              | Pair nextAction、证据、异常与审批   |
| `/api/workspaces/{workspaceId}/iterations/{id}/showcase[...]`                 | GET、POST              | Q2、产品观察、风险、Review 与决定   |
| `/api/workspaces/{workspaceId}/iterations/{id}/respond[...]`                  | GET、POST              | 知识响应 Candidate 与人工决定       |
| `/api/workspaces/{workspaceId}/stories[/{storyId}]`                           | GET                    | 权威 Story 查询                     |
| `/api/workspaces/{workspaceId}/stories/{storyId}/revisions[/{id}]`            | GET                    | 不可变 Story Revision               |
| `/api/workspaces/{workspaceId}/logical-entities[/{entityId}]`                 | GET、POST、PUT、DELETE | 逻辑实体 CRUD                       |
| `/api/workspaces/{workspaceId}/logical-relationships[/{relationshipId}]`      | GET、POST、PUT、DELETE | 逻辑关系 CRUD                       |

## Java、TypeScript 与 Nx 规范

- Java 17+、Node.js 22+、pnpm 10+；使用 Gradle wrapper、workspace 根脚本和 Nx targets。
- 新建 app/lib 必须先使用适用的 Nx generator，不能手工伪造项目结构。
- Java 模块依赖通过 Gradle project dependency 建立；TypeScript sibling package 通过 pnpm workspace 命令建立并保持 `workspace:*`，不得用 tsconfig path 绕过链接。
- `apps/web` 是唯一 React 组合根；可复用 shell、feature、UI 和 API client 放入 `libs/web/*`。
- Gradle/Nx、Vite/Vitest targets 由插件推断时不要在 `project.json` 重复声明。
- Java 测试放在 owning module 的 `src/test/java`；TypeScript 测试使用 `{src,tests}/**/*.{test,spec}.*`。
- 不手改生成的 Prisma Client 或 OpenAPI Web 类型；通过 `pnpm prisma:generate`、`pnpm api:generate` 更新。
- Java 格式化使用 Spotless/Google Java Format；时间戳输出使用 RFC 3339 / ISO 8601。
- 所有查询和文件投影必须遵守软删除及工作空间边界。

### 持久化变更

新增持久化行为时：

1. 先在 `libs/server-java/domain` 或 `libs/server-java/application` 定义或收窄 port 与领域行为。
2. 在 `libs/server-java/persistent` 实现 PostgreSQL 或 filesystem adapter；不要把 storage 分支放进 JAX-RS resource。
3. 为 fake 与生产 adapter 维护等价行为测试；PostgreSQL 差异使用 Testcontainers 专门验证。
4. 迁移期继续在 `libs/server/persistent/prisma/migrations` 维护版本化 SQL；Java build 将其打包为 Flyway migrations，生产 Java Server 通过 Flyway 校验和升级。不得使用 Hibernate 自动建表。
5. `.evidence` YAML 写入应保持路径安全、原子替换和已有文件保护。

## Electron 规范

- `apps/desktop/src/main.ts` 是 Desktop composition root；不得打包或启动任何 Server 子进程。
- 保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- preload bridge 只暴露 API URL、目录选择/Workspace binding 与本地 Agent 的最小能力；新增能力必须有 sender validation 和最小权限测试。
- 打包 renderer 使用 `evidence://app/`，必须保留 SPA fallback、路径穿越防护和外部导航拦截。
- `EVIDENCE_API_BASE_URL` 必须指向通过健康检查的 API；非 loopback endpoint 必须使用 HTTPS。
- Pi SDK 必须作为 production dependency 嵌入包中；Desktop 包不得嵌入 Server 或数据库，Server 不加载 Pi SDK。
- Pair、Showcase 与 Respond 必须复用隔离 branch/worktree 和最小权限工具；完整路径、源码、diff、stdout、Prompt、Pi 消息及凭据不得上传 Server。
- 只有人工接受且 diff hash 校验一致后才能创建本地 commit；不得自动 merge 或 push。
- 打包事实来源是 `apps/desktop/electron-builder.yml`。发布边界变化必须运行 unpacked/package smoke。

## 测试与质量门禁

常规门禁：

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm api:check
pnpm api:contracts
```

聚焦门禁：

```sh
pnpm nx run @evidence/server:test
pnpm nx run @evidence/server:build
pnpm api:contracts
pnpm nx test @evidence/desktop --run
pnpm nx run @evidence/desktop:package-smoke
```

Nest rollback parity 仅在明确需要时运行 `pnpm api:contracts:parity`。PostgreSQL 行为必须由 Java/Testcontainers 或指向已迁移临时 PostgreSQL 的 black-box contracts 验证。检查失败必须修复并重跑，不得跳过。

## 仓库地图

| 路径                            | 用途                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `apps/web/`                     | React + Vite 前端组合根                               |
| `libs/web/*`                    | Web shell、features、UI、HAL API client               |
| `apps/server-java/`             | 生产 Spring Boot/Jersey 组合根                        |
| `libs/server-java/domain/`      | Smart Domain 领域模型与 ports                         |
| `libs/server-java/application/` | Use cases、事务与授权编排                             |
| `libs/server-java/api/`         | JAX-RS、HAL 和 HTTP adapter                           |
| `libs/server-java/persistent/`  | MyBatis/PostgreSQL、Flyway 和 filesystem adapters     |
| `apps/server/`、`libs/server/*` | 退役前保留的 Nest rollback/parity 实现                |
| `apps/desktop/`                 | Electron main/preload、remote API bridge 和 packaging |
| `libs/contracts/api-contracts/` | 本地/远程 black-box API contracts                     |
| `docs/product/`                 | 统一产品上下文、画像和旅程                            |
| `.evidence/`                    | Evidence 产品权威领域模型                             |
| `docs/architecture/`            | 统一架构和测试策略                                    |

## Git 纪律

- 一个 commit 只处理一个关注点；除机械移动/删除外，目标为少于 10 个文件、少于 1000 行。
- 使用 Conventional Commits：`<type>(<scope>): <subject>`。
- scope：`web`、`desktop`、`server`、`workspace`、`deps`、`ci`、`docs`、`release`。
- pre-commit 运行 Nx format 与 ESLint；commit-msg 运行 commitlint。
- 不提交 generated build output、package artifacts、数据库文件、迁移备份或本地计划。

## 建议阅读顺序

1. `AGENTS.md`
2. `apps/server-java/src/main/java/reengineering/ddd/evidence/Application.java`
3. `libs/server-java/domain/src/main/java/`
4. `libs/server-java/application/src/main/java/`
5. `libs/server-java/api/src/main/java/`
6. `libs/server-java/persistent/src/main/java/`
7. `apps/desktop/src/{main,preload}.ts` 与 `apps/desktop/src/{electron,iteration,loops,capabilities,adapters}/`
8. `apps/desktop/electron-builder.yml`
