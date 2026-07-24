# Evidence 仓库指南

Evidence 是一个领域建模与证据映射平台，具有三个产品运行时界面：

- **Web**：`apps/web/` 中的 React + Vite SPA，复用 `libs/web/*`。
- **Server**：`apps/server/` 中的 NestJS 组合根，实现在 `libs/server/{api,domain,persistent,infrastructure}`。
- **Desktop**：`apps/desktop/` 中的 Electron 壳；复用同一个 Web renderer，并连接经过健康检查的 Server API。

项目本地的 Evidence Orchestrator 位于 `.pi/` 与 `engineering/evidence-orchestrator/`。它只用于开发本仓库，不属于产品运行时。

## 运行时拓扑

```text
Browser
  └─ apps/web + libs/web/*              React/Vite :4200
       └─ REST/HAL
            └─ apps/server              NestJS :3000
                 ├─ Prisma → PostgreSQL（默认 hosted 模式）
                 ├─ workspace registry
                 └─ workspace/.evidence YAML model

Electron
  └─ apps/desktop                       main + restricted preload
       ├─ packaged apps/web renderer
       ├─ embedded Pi SDK agent
       └─ REST/HAL → configured Server API
```

- Web 与 Desktop 必须共享 REST/HAL 和领域语义；不得通过 Electron IPC 复制业务 API。
- Server 只使用 Prisma/PostgreSQL registry；不存在 Desktop 专用数据库或第二个 Server 组合根。
- Electron 必须设置 `EVIDENCE_API_BASE_URL`，并在启动时健康检查远程 HTTPS API；开发时允许 loopback HTTP。
- Desktop renderer 只通过受限 preload 取得 API URL、目录选择/Workspace binding 和本地 Agent 能力；业务 command/query 始终走 Server API。

## 服务端分层

| 层               | 路径                                     | 职责                                                                     |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Composition root | `apps/server/src/`                       | Nest bootstrap、runtime config 与 PostgreSQL adapter wiring              |
| API              | `libs/server/api/src/api/`               | Controller、请求解析、HAL 序列化、vendor media type、SSE 映射            |
| Domain           | `libs/server/domain/src/domain/`         | 纯 TypeScript 领域对象、port 与规则；不依赖 Nest、Prisma、HTTP、Electron |
| Persistence      | `libs/server/persistent/src/persistent/` | Prisma/PostgreSQL registry 与 `.evidence` 文件模型 adapter               |
| Infrastructure   | `libs/server/infrastructure/src/`        | Pi SDK `DomainArchitect` adapter 等外部集成                              |

依赖方向必须保持：composition/API/persistence/infrastructure 可以依赖 domain，domain 不得反向依赖框架或 adapter。Controller 只负责协议转换与委托；业务规则进入 domain 或明确的 domain port 实现。

### 核心领域抽象

- `Entity`：提供 `identity()` 与 `description()`。
- `HasOne<T>` / `HasMany<T>`：聚合关系的最窄读取接口。
- `Ref<T>`：跨实体引用。
- `DomainError`：统一表达 not found、validation、conflict 和 internal 错误。
- `DomainArchitect`：流式 AI 建模 port；API 不直接依赖 Pi。

### 领域聚合

| 聚合 / 概念                   | 说明                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `User`                        | 用户身份及可访问工作空间                                |
| `Workspace`                   | 成员、当前图、逻辑模型和 `.evidence` 根的协作边界       |
| `Member`                      | 用户到工作空间的成员关系与角色                          |
| `LogicalEntity`               | Evidence、Participant、Role 或 Context 类型的业务概念   |
| `LogicalRelationship`         | 同一工作空间内两个逻辑实体之间的关系                    |
| `Diagram`                     | 工作空间逻辑模型的单一当前投影，固定 id 为 `model`      |
| `DiagramNode` / `DiagramEdge` | 从 `.evidence` 实体和关联投影出的图元素                 |
| `ModelingProposal`            | AI 提出的模型变更建议；不能绕过用户确认直接修改权威模型 |
| `InboxItem` / `InboxRevision` | 来源身份、处理状态和不可变内容快照                        |
| `StoryCandidate`              | 引用精确 Inbox Revision 的非权威交付提案                  |
| `Story` / `StoryRevision`     | 人工确认后的稳定身份与不可变权威修订                      |

Story Candidate 只能经显式确认原子创建 `Story + StoryRevision v1`，确认重试必须返回同一 Revision；拒绝不得创建 Story。Workspace 创建或导入时必须初始化 Server 私有 `modelRoot/.evidence/{entities,associations}`；HAL metadata 不得包含 Server 或 Desktop 绝对路径。Desktop repositoryRoot 只保存在以 API + Workspace 为键的本地 binding store。逻辑关系的 source/target 必须属于同一工作空间且均存在。

## REST/OpenAPI

API 使用 HAL 风格 JSON：资源包含 `_links`，集合使用 `_embedded`，分页使用 `page` 与 `pageSize`。

- Nest 拥有的 OpenAPI 源文件：`libs/server/api/openapi.yaml`。
- 生成的 Web 类型：`libs/web/api-client/src/lib/openapi-schema.ts`。
- 修改 API 时必须同步实现、OpenAPI、black-box contract tests 和生成客户端。

主要路由：

| 路由                                                                     | 方法                   | 说明                   |
| ------------------------------------------------------------------------ | ---------------------- | ---------------------- |
| `/api`、`/health`、`/api/openapi.json`                                   | GET                    | 根、健康检查和 OpenAPI |
| `/api/users/{userId}`                                                    | GET                    | 用户资源               |
| `/api/users/{userId}/sidebar`                                            | GET                    | 工作空间导航投影       |
| `/api/users/{userId}/workspaces`                                         | GET、POST              | 查询/创建工作空间      |
| `/api/users/{userId}/workspaces/{workspaceId}`                           | GET、PUT、DELETE       | 工作空间 CRUD          |
| `/api/users/{userId}/workspaces/{workspaceId}/members`                   | GET、POST              | 查询/添加成员          |
| `/api/users/{userId}/workspaces/{workspaceId}/members/{memberId}`        | DELETE                 | 移除成员               |
| `/api/workspaces/{workspaceId}/diagram`                                  | GET                    | 单一当前图             |
| `/api/workspaces/{workspaceId}/diagram/nodes[/{nodeId}]`                 | GET                    | 图节点投影             |
| `/api/workspaces/{workspaceId}/diagram/edges[/{edgeId}]`                 | GET                    | 图边投影               |
| `/api/workspaces/{workspaceId}/diagram/propose-model`                    | POST（SSE）            | 流式建模提案           |
| `/api/workspaces/{workspaceId}/inbox-items[/{itemId}]`                   | GET、POST、PATCH       | Inbox 捕获、查询和状态 |
| `/api/workspaces/{workspaceId}/inbox-items/{itemId}/revisions[/{id}]`    | GET、POST              | 不可变 Inbox Revision  |
| `/api/workspaces/{workspaceId}/story-candidates[/{candidateId}]`         | GET、POST              | Candidate 提议与查询   |
| `/api/workspaces/{workspaceId}/story-candidates/{id}/{confirm,reject}`   | POST                   | 人工确认或拒绝         |
| `/api/workspaces/{workspaceId}/stories[/{storyId}]`                      | GET                    | 权威 Story 查询        |
| `/api/workspaces/{workspaceId}/stories/{storyId}/revisions[/{id}]`       | GET、POST（集合）       | 不可变 Story Revision  |
| `/api/workspaces/{workspaceId}/logical-entities[/{entityId}]`            | GET、POST、PUT、DELETE | 逻辑实体 CRUD          |
| `/api/workspaces/{workspaceId}/logical-relationships[/{relationshipId}]` | GET、POST、PUT、DELETE | 逻辑关系 CRUD          |

## TypeScript 与 Nx 规范

- Node.js 22+、pnpm 10+；使用 workspace 根脚本和 Nx targets。
- 新建 app/lib 必须先使用 Nx generator，不能手工伪造项目结构。
- sibling package 依赖必须通过 pnpm workspace 命令建立，并在 manifest 中保持 `workspace:*`；不得用 tsconfig path 绕过 package linking。
- `apps/web` 是唯一 React 组合根；可复用 shell、feature、UI 和 API client 放入 `libs/web/*`。
- Vite/Vitest targets 由 Nx 插件推断时不要在 `project.json` 重复声明。
- 测试文件使用 `{src,tests}/**/*.{test,spec}.*`，优先放在 owning module 附近。
- 不手改 Prisma Client 或 OpenAPI 生成文件；通过 `pnpm prisma:generate`、`pnpm api:generate` 更新。
- 时间戳输出使用 RFC 3339 / ISO 8601。
- 所有查询和文件投影必须遵守软删除及工作空间边界。

### 持久化变更

新增持久化行为时：

1. 先在 `libs/server/domain` 定义或收窄 port/领域行为。
2. 在 `libs/server/persistent` 实现 PostgreSQL 或 filesystem adapter；不要把 storage 分支放进 controller。
3. 为 memory/fake 与生产 adapter 维护等价行为测试；数据库差异必须有专门测试。
4. PostgreSQL schema 通过 `apps/server/prisma/schema.prisma` 和受版本控制的 Prisma migration 演进，生产使用 `prisma migrate deploy`。
5. `.evidence` YAML 写入应保持路径安全、原子替换和已有文件保护。

旧版 PostgreSQL 数据只能通过 `apps/server/src/migration/` 中的受控迁移器导入：从已备份的源数据库 ETL 到独立目标数据库和模型目录，支持 dry run 与 manifest。

## Electron 规范

- `apps/desktop/src/main.ts` 是 Desktop composition root；不得打包或启动 Nest 子进程。
- 保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- preload bridge 只暴露 API URL、目录选择/Workspace binding 与本地 Agent 的最小能力；新增能力必须有 sender validation 和最小权限测试。
- 打包 renderer 使用 `evidence://app/`，必须保留 SPA fallback、路径穿越防护和外部导航拦截。
- `EVIDENCE_API_BASE_URL` 必须指向通过健康检查的 API；非 loopback endpoint 必须使用 HTTPS。
- Pi SDK 必须作为 production dependency 嵌入包中；Desktop 包不得嵌入 Server 或数据库。
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
pnpm orchestrator:validate
```

聚焦门禁：

```sh
pnpm nx test @evidence/server --run
pnpm nx test @evidence/server-api --run
pnpm nx test @evidence/server-domain --run
pnpm nx test @evidence/server-persistent --run
pnpm nx test @evidence/server-infrastructure --run
pnpm nx test @evidence/desktop --run
pnpm nx run @evidence/desktop:package-smoke
```

PostgreSQL 行为需在临时 PostgreSQL 上先执行 `prisma migrate deploy`，再运行相应契约或黑盒测试。检查失败必须修复并重跑，不得跳过。

## 仓库地图

| 路径                                        | 用途                                                  |
| ------------------------------------------- | ----------------------------------------------------- |
| `apps/web/`                                 | React + Vite 前端组合根                               |
| `libs/web/*`                                | Web shell、features、UI、HAL API client               |
| `apps/server/`                              | NestJS/PostgreSQL 组合根、Prisma 与迁移入口           |
| `libs/server/api/`                          | Nest controllers、HAL/SSE 和 OpenAPI source           |
| `libs/server/domain/`                       | 纯领域模型与 ports                                    |
| `libs/server/persistent/`                   | PostgreSQL 和 filesystem adapters                     |
| `libs/server/infrastructure/`               | Pi SDK 等外部适配器                                   |
| `apps/desktop/`                             | Electron main/preload、remote API bridge 和 packaging |
| `libs/contracts/api-contracts/`             | 本地/远程 black-box API contracts                     |
| `docs/product/`                             | 统一产品上下文、画像和旅程                            |
| `.evidence/`                                | Evidence 产品权威领域模型                             |
| `docs/architecture/`                        | 统一架构和测试策略                                    |
| `engineering/evidence-orchestrator/`        | 内部 runtime contexts、工序与 DoD                     |
| `.pi/extensions/evidence-orchestrator/`     | 内部六循环编排器                                      |
| `artifacts/inbox/`、`artifacts/iterations/` | 不可变来源和迭代证据；历史内容不得改写                |

## Git 纪律

- 一个 commit 只处理一个关注点；除机械移动/删除外，目标为少于 10 个文件、少于 1000 行。
- 使用 Conventional Commits：`<type>(<scope>): <subject>`。
- scope：`web`、`desktop`、`server`、`workspace`、`deps`、`ci`、`docs`、`release`。
- pre-commit 运行 Nx format 与 ESLint；commit-msg 运行 commitlint。
- 不提交 generated build output、package artifacts、数据库文件、迁移备份或本地计划。

## 建议阅读顺序

1. `AGENTS.md`
2. `apps/server/src/bootstrap.ts`
3. `apps/server/src/app/{app.module,persistence.module}.ts`
4. `libs/server/domain/src/domain/index.ts`
5. `libs/server/api/src/api/api.module.ts`
6. `libs/server/persistent/src/persistent/{prisma,filesystem}/`
7. `apps/desktop/src/{main,runtime-config}.ts`
8. `apps/desktop/electron-builder.yml`
9. `engineering/evidence-orchestrator/runtime-contexts.json`
