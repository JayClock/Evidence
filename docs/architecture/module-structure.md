# Evidence 模块结构

## 组合根与实现库

```text
apps/
├── web/                    React/Vite composition root
├── server/                 Nest/PostgreSQL composition root
└── desktop/                Electron main/preload and packaging

libs/
├── web/
│   ├── api-client/
│   ├── ui/
│   ├── web-shell/
│   └── web-feature-*/
├── server/
│   ├── api/                controllers, HAL, OpenAPI source
│   ├── domain/             framework-free domain and ports
│   └── persistent/         Prisma and filesystem adapters
└── contracts/
    └── api-contracts/      local/remote black-box contracts
```

## 放置规则

- Web route composition 放在 `apps/web`；可复用 shell、feature、UI 和 API 能力放在 `libs/web/*`。Work Intake 与 Delivery UI 分别由 `web-feature-inbox`、`web-feature-delivery` 拥有。
- Nest bootstrap、environment parsing 和 adapter wiring 放在 `apps/server`。
- 业务模型、ports 和不变量放在 `libs/server/domain`；不得导入 Nest、Prisma 或 Electron。
- Controller、请求/响应模型、HAL links 和 media type 放在 `libs/server/api`。
- Prisma schema/migrations、PostgreSQL registry 与 `.evidence` filesystem adapter 放在 `libs/server/persistent`；Candidate selection 必须原子创建 Iteration/Frozen Intake，Kickoff confirm 必须原子创建唯一 Story、Problem Statement、Story Card 与 baseline Revision。
- Desktop 拥有 Electron 壳、受限 preload、本地 workspace binding、隔离 Git worktree、Agent/controller 执行和 packaging；共享 UI 留在 Web，业务 API 留在 Server。
- OpenAPI source 位于 `libs/server/api/openapi.yaml`；生成的 Web 类型位于 `libs/web/api-client`；契约 runner 位于 `libs/contracts/api-contracts`。

## Server composition roots

```text
apps/server/src/main.ts
  └─ AppModule
       ├─ Prisma/PostgreSQL registry
       ├─ ApiModule
       ├─ Domain ports
       └─ filesystem model projection
```

Persistence wiring 不得渗入 controller。Desktop 通过 `EVIDENCE_API_BASE_URL` 连接该 Server，以 API + Workspace 在 userData 中保存本地路径，并在受限本地 Agent runtime 中使用嵌入式 Pi SDK。Server 不加载 Pi SDK；本地路径、Authorization、源码、完整 diff、Prompt 和 Pi 消息不通过产品 REST payload 传递。

## Desktop source ownership

```text
apps/desktop/src/
├── main.ts / preload.ts             Electron composition and restricted bridge entrypoints
├── electron/                        window-independent IPC, authorization and runtime config
├── features/{diagram,inbox}/        product capabilities outside an Iteration loop
├── iteration/                       Candidate selection and local worktree provisioning
├── loops/{kickoff,understand,tasking,pair,showcase,respond}/
├── capabilities/                    shared local process, worktree and execution mechanisms
├── adapters/{git,node,nx,pi,server-api}/
└── validation/                      executable source ownership rules
```

- 只有 `main.ts` 与 `preload.ts` 保留在 `src/` 根；测试与实现共置。
- Loop 不导入其他 Loop 的私有实现；跨 Loop 交接只能消费显式 `public.ts` contract。
- Capability 与 Adapter 不依赖产品 Feature、Iteration 或 Loop；两个以上所有者复用的机制先提升为 Capability。
- `Intake` 只表示领域中的 Frozen Intake，不作为 Desktop 技术目录或共享文件前缀。
- Source runtime 可以移动，但 `scripts/build.mjs` 必须显式保持受打包配置引用的 `dist/*.mjs` 名称稳定。
- `validation/source-boundaries.spec.ts` 锁定以上规则。

## 禁止依赖

- Domain → API、ORM、HTTP framework、React 或 Electron。
- Web feature → Server 内部类型或数据库 schema。
- Desktop → 第二套 React 业务页面或 IPC 业务 API。
- Hosted-only adapter → Desktop renderer。
- Server Workspace metadata → Desktop repositoryRoot；Server 只持有私有 modelRoot。
- 未经人工接受的 Desktop coding worktree → merge 或 push。
