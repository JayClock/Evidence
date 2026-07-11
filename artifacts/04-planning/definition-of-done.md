# 完成定义

本文定义 Evidence 项目在需求、领域模型、架构、计划、编码和评审阶段的 Definition of Done。编码阶段必须以真实代码和测试变更为准，Markdown 说明不能替代实现。

## 通用完成定义

任一阶段完成前必须满足：

- 阶段要求的 artifacts 已写入对应目录。
- `evidence-state.json` 已更新到下一阶段或正确 pending gate。
- 如阶段配置需要审核，`artifacts/gates/` 下已生成 gate 文件。
- 工件内容围绕 Evidence 当前项目，不复制上游 POC 的业务输出。
- 文件路径、命令、工具名与 Evidence Workflow 前缀一致。

## 需求阶段 DoD

- `artifacts/01-requirements/personas.md` 已完成。
- `artifacts/01-requirements/problem-statement.md` 已完成。
- `artifacts/01-requirements/story-map.md` 已完成。
- 用户故事包含 ID、角色、价值、验收标准和优先级。
- 需求明确 Web/Desktop 共享前端、工作区、逻辑实体、图建模和契约测试质量门。

## 领域建模阶段 DoD

- `artifacts/02-domain-model/ubiquitous-language.md` 已完成。
- `artifacts/02-domain-model/bounded-contexts.md` 已完成。
- `artifacts/02-domain-model/entities-and-value-objects.md` 已完成。
- `artifacts/02-domain-model/aggregates.md` 已完成。
- `artifacts/02-domain-model/domain-events.md` 已完成。
- 模型使用 Evidence 当前 domain 语言：User、Workspace、Member、LogicalEntity、Diagram、DiagramNode、DiagramEdge。
- 明确 LogicalEntity 与 DiagramNode 的区别。
- 明确 fake store 与 PostgreSQL 共享契约测试。

## 架构阶段 DoD

- `artifacts/03-architecture/context-map.md` 已完成。
- `artifacts/03-architecture/architecture-style.md` 已完成。
- `artifacts/03-architecture/tech-stack.md` 已完成。
- `artifacts/03-architecture/module-structure.md` 已完成。
- `artifacts/03-architecture/api-contracts.md` 已完成。
- `artifacts/03-architecture/data-model.md` 已完成。
- 架构保持 `apps/web` 为唯一前端源码。
- 架构保持 Rust Axum 主后端的 API/Domain/Persistent 分层。
- API 契约保持 REST/HAL 语义。
- 数据模型包含 soft delete、seed data、核心表和测试建议。

## 计划阶段 DoD

- `artifacts/04-planning/product-backlog.md` 已完成。
- `artifacts/04-planning/sprint-plan.md` 已完成。
- `artifacts/04-planning/sprint-1-backlog.md` 已完成。
- `artifacts/04-planning/definition-of-done.md` 已完成。
- Sprint 1 Backlog 中每个选中故事均有任务、验收标准和验证方式。
- Sprint 1 范围聚焦可交付闭环，避免过度发散。

## 编码阶段 DoD

编码阶段必须满足：

- 至少一个 Sprint 1 故事被真实实现或修复。
- 先写或补齐测试，再实现或修复代码。
- 改动应优先落在正确模块：
  - 后端 API：`apps/server/src/api/`
  - 后端领域：`apps/server/src/domain/`
  - 持久化：`apps/server/src/persistent/`
  - 前端：`apps/web/`
  - API client：`libs/web/api-client/`
- 不将业务规则塞入 API handler。
- 不让 domain 依赖 Axum、SeaORM、React 或 Tauri。
- 不复制 `apps/web` 到 Desktop。
- 不以 Markdown 伪代码替代源码。
- `artifacts/05-code/` 包含实现说明、测试结果和风险记录。

## 测试 DoD

根据改动范围运行：

```sh
cargo test -p evidence-server
```

后端逻辑改动还应考虑：

```sh
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo fmt -p evidence-server -- --check
```

前端改动还应运行：

```sh
pnpm test
pnpm typecheck
pnpm lint
```

API contract 改动还应运行：

```sh
pnpm api:export
pnpm api:generate
pnpm api:contracts
```

PostgreSQL 环境可用时运行：

```sh
cargo test -p evidence-server --features postgres-tests
```

若某个命令无法运行，必须在 `artifacts/05-code/` 或 review 工件中记录原因、环境缺口和风险。

## Review 阶段 DoD

- `artifacts/06-reviews/review-round<round>.md` 已生成。
- Review 同时检查 artifacts、源码、测试和本 DoD。
- Review 明确列出 Critical / Major / Minor 问题。
- Critical 问题必须阻止完成。
- Major 问题必须有修复计划或明确接受理由。
- Review 结论必须说明是否可以进入下一轮或完成。

## 不可接受的完成状态

- 只生成 Markdown，没有真实代码或测试支持编码阶段结论。
- 新增 API 没有 `_links` 或集合缺少 `_embedded`/`page`。
- 新增持久化行为只在 fake store 中实现，PostgreSQL 语义未考虑。
- domain 层引入 Axum、SeaORM、React、Tauri 等外部框架依赖。
- Desktop 引入第二套前端业务逻辑。
- 测试失败但未记录原因。
- `evidence-state.json` 与 artifacts 状态不一致。
