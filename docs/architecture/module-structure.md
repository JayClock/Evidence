# Evidence 模块结构

## 组合根与实现库

```text
apps/
├── web/                    React/Vite composition root
├── server/                 Nest hosted/Desktop composition roots
└── desktop/                Electron main/preload and packaging

libs/
├── web/
│   ├── api-client/
│   ├── ui/
│   ├── web-shell/
│   └── web-feature-*/
├── server/
│   ├── api/                controllers, HAL/SSE, OpenAPI source
│   ├── domain/             framework-free domain and ports
│   ├── persistent/         Prisma, SQLite, filesystem adapters
│   └── infrastructure/     Pi SDK adapter
└── contracts/
    └── api-contracts/      local/remote black-box contracts
```

## 放置规则

- Web route composition 放在 `apps/web`；可复用 shell、feature、UI 和 API 能力放在 `libs/web/*`。
- Nest bootstrap、environment parsing 和 adapter wiring 放在 `apps/server`。
- 业务模型、ports 和不变量放在 `libs/server/domain`；不得导入 Nest、Prisma 或 Electron。
- Controller、请求/响应模型、HAL links、media type 和 SSE serialization 放在 `libs/server/api`。
- PostgreSQL/SQLite registry 与 `.evidence` filesystem adapter 放在 `libs/server/persistent`。
- Pi SDK 等外部 adapter 放在 `libs/server/infrastructure`。
- Desktop 只拥有 Electron 壳、本地 Nest 生命周期、受限 preload、协议和 packaging；共享 UI 留在 Web，业务 API 留在 Server。
- OpenAPI source 位于 `libs/server/api/openapi.yaml`；发布副本位于 `contracts/api.yaml`；契约 runner 位于 `libs/contracts/api-contracts`。

## Server composition roots

```text
apps/server/src/main.ts
  └─ AppModule
       └─ Prisma/PostgreSQL registry

apps/server/src/desktop-main.ts
  └─ DesktopAppModule
       └─ node:sqlite registry

both
  ├─ ApiModule
  ├─ Domain ports
  ├─ filesystem model projection
  └─ PiSdkDomainArchitect
```

Storage selection 不得渗入 controller。Desktop 本地 child 的 host、port、token、registry path 和 workspace path 由 Electron main 通过环境显式传入；Pi SDK 在 Nest child 进程内运行。

## 禁止依赖

- Domain → API、ORM、HTTP framework、React 或 Electron。
- Web feature → Server 内部类型或数据库 schema。
- Desktop → 第二套 React 业务页面或 IPC 业务 API。
- Hosted-only adapter → Desktop renderer。
- Runtime code → `artifacts/iterations`、`.pi` 或内部 Orchestrator state。
- 兼容迁移器 → 恢复已退役的 runtime 组合根。

## 内部 Orchestrator 与知识结构

```text
.pi/extensions/evidence-orchestrator/
├── iteration/                          repository Board and Story state
├── loops/{kickoff,understand,tasking,pair,showcase,respond}/
├── capabilities/                       shared deterministic mechanisms
├── adapters/{pi,github,node}/          external hosts and processes
├── validation/                         source/evidence validators
└── test-support/                       integration fixtures and mocks

.pi/agents/                             isolated activity roles
.pi/skills/ and .pi/prompts/            internal Working Knowledge
.evidence/                              canonical product domain model
docs/product/                           canonical product knowledge
docs/architecture/                      canonical technical solution
engineering/evidence-orchestrator/      contexts, processes and DoD
.git/evidence-orchestrator/              local Board, locks and leases
.worktrees/evidence/ITER-xxxx/           isolated Story worktrees
artifacts/iterations/                    immutable per-Story evidence
```

Orchestrator 内部依赖方向为 `adapters → loops → capabilities/iteration`。以上模块都是当前仓库的内部研发工具链，不属于 `apps/*` / `libs/*` 产品 runtime；产品代码不得依赖它们。历史 iteration 即使记录旧 runtime 也保持不可变。
