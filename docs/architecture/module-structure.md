# Evidence 模块结构

## 组合根与实现库

```text
apps/
├── web/                    React/Vite composition root
├── server/                 Rust Axum composition root
├── server-nest/            Nest composition root
└── desktop/                Tauri shell

libs/
├── web/
│   ├── api-client/
│   ├── ui/
│   ├── web-shell/
│   └── web-feature-*/
├── server/
│   ├── api/
│   ├── domain/
│   ├── persistent/
│   └── infrastructure/
├── server-nest/
│   ├── api/
│   ├── domain/
│   └── persistent/
└── contracts/api-contracts/
```

## 放置规则

- Web route composition 放在 `apps/web`；可复用 shell、feature、UI 和 API 能力放在 `libs/web/*`。
- Rust 启动与 wiring 放在 `apps/server`；业务实现分别进入 `libs/server/domain`、`api`、`persistent`、`infrastructure`。
- Nest 启动与 wiring 放在 `apps/server-nest`；实现进入对应 `libs/server-nest/*`。
- Desktop 仅拥有 Tauri 壳和桌面特有 adapter；共享 UI 必须留在 Web。
- API 契约位于 `contracts/api.yaml`；契约测试能力位于 `libs/contracts/api-contracts`。

## 禁止依赖

- Domain → API、ORM、HTTP framework、React 或 Tauri。
- Web feature → Rust/Nest 内部类型或数据库 schema。
- Desktop → 第二套 React 业务页面。
- Rust server track ↔ Nest server track 的实现级混合。
- Runtime code → `artifacts/iterations`。

## 内部 Orchestrator 与知识结构

```text
.pi/extensions/evidence-orchestrator/  deterministic orchestration runtime
.pi/agents/                             isolated phase agents
.evidence/                              canonical domain model
docs/product/                           canonical product knowledge
docs/architecture/                      canonical technical solution
engineering/evidence-orchestrator/      contexts, processes and DoD
artifacts/iterations/                    immutable iteration evidence
```

以上 Orchestrator、Agent、Working Knowledge 与 iteration evidence 都属于当前仓库的内部研发工具链，不是 `apps/*` / `libs/*` 中的 Evidence 产品模块。产品运行时代码不得依赖它们，`.evidence/` 也不得为其建立交付流程概念。Evidence 项目使用自身产品模型进行 dogfooding 只是开发验证方式。
