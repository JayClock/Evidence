# Evidence 模块结构

## 组合根与实现库

```text
apps/
├── web/                         React/Vite composition root
├── server-java/                 Spring Boot/Jersey composition root
└── desktop/                     Electron main/preload and packaging

libs/
├── web/
│   ├── api-client/
│   ├── ui/
│   ├── web-shell/
│   └── web-feature-*/
├── server-java/
│   ├── api/                     JAX-RS, HAL and resource assemblers
│   ├── application/             use cases, authorization and transactions
│   ├── domain/                  framework-free domain and ports
│   ├── persistent/              MyBatis, Flyway and filesystem adapters
│   └── infrastructure/security/ local/OIDC authentication adapter
└── contracts/
    ├── evidence.openapi         language-neutral REST contract
    └── api-contracts/           local/remote black-box contracts
```

## 放置规则

- Web route composition 放在 `apps/web`；可复用 shell、feature、UI 和 API 能力放在 `libs/web/*`。
- Spring Boot bootstrap、environment parsing 和 adapter wiring 放在 `apps/server-java`。
- 业务模型、ports 和不变量放在 `libs/server-java/domain`；不得导入 Spring、MyBatis、JAX-RS 或 Electron。
- Use case、事务和授权编排放在 `libs/server-java/application`。
- JAX-RS resource、请求/响应模型、HAL links 和 media type 放在 `libs/server-java/api`。
- MyBatis mapper、Flyway migrations、PostgreSQL registry 与 `.evidence` filesystem adapter 放在 `libs/server-java/persistent`。
- local/OIDC authentication adapter 放在 `libs/server-java/infrastructure/security`。
- Desktop 拥有 Electron 壳、受限 preload、本地 workspace binding、隔离 Git worktree、Agent/controller 执行和 packaging；业务 API 留在 Server。
- OpenAPI source 位于 `libs/contracts/evidence.openapi`；生成的 Web 类型位于 `libs/web/api-client`。

## Server composition root

```text
apps/server-java/Application
  ├─ Jersey resources
  ├─ application services and transaction boundaries
  ├─ MyBatis/PostgreSQL + Flyway
  ├─ filesystem model adapters
  └─ local/OIDC security adapters
```

Persistence wiring 不得渗入 JAX-RS resource。Server 不加载 Pi SDK；本地路径、Authorization、源码、完整 diff、Prompt 和 Pi 消息不通过产品 REST payload 传递。

## Desktop source ownership

```text
apps/desktop/src/
├── main.ts / preload.ts
├── electron/
├── features/{diagram,inbox}/
├── iteration/
├── loops/{kickoff,understand,tasking,pair,showcase,respond}/
├── capabilities/
├── adapters/{git,node,nx,pi,server-api}/
└── validation/
```

- Loop 不导入其他 Loop 的私有实现；跨 Loop 交接只能消费显式 `public.ts` contract。
- Capability 与 Adapter 不依赖产品 Feature、Iteration 或 Loop。
- `validation/source-boundaries.spec.ts` 锁定以上规则。

## 禁止依赖

- Domain → API、Spring、MyBatis、React 或 Electron。
- Web feature → Server 内部类型或数据库 schema。
- Desktop → 第二套 React 业务页面或 IPC 业务 API。
- Server Workspace metadata → Desktop `repositoryRoot`。
- 未经人工接受的 Desktop coding worktree → merge 或 push。
