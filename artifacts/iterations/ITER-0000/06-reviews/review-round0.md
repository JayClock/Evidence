# 第 0 轮评审 —— 编码阶段

## 评审范围

- 被评审阶段：`coding`
- 已实现用户故事：US-001 / PBI-001 —— API Root 默认入口
- 已评审工件：
  - `artifacts/05-code/us-001-api-root-tdd.md`
  - `artifacts/04-planning/definition-of-done.md`
  - `artifacts/03-architecture/module-structure.md`
  - `evidence-state.json`
- 已评审源码与测试：
  - `libs/server/api/src/api/root.rs`
  - `libs/server/api/tests/root_contract.rs`
  - `libs/server/api/Cargo.toml`
  - `Cargo.lock`

## 摘要

编码阶段完成了一个小而有效的 TDD 增量，用于实现 US-001。该增量新增了 `GET /api` 的真实 Axum Router 集成测试，验证了 HAL root links 和 vendor media type，补充了测试专用的 `tower` 依赖，并通过在 root API handler 中提取 `DEFAULT_USER_ID` 完成了最小重构。

## DoD 评估

- ✅ 至少实现或修复了一个 Sprint 1 用户故事：US-001。
- ✅ 存在测试先行证据：`artifacts/05-code/us-001-api-root-tdd.md` 记录了初始失败测试运行和依赖修复过程。
- ✅ 已在当前后端 API 模块布局下修改真实代码和测试：`libs/server/api/src/...` 与 `libs/server/api/tests/...`。
- ✅ API 响应仍保持 HAL 风格，包含 `_links.self`、`_links.health` 和 `_links.default-user`。
- ✅ 未在 API handler 中加入业务规则；实现仅限于端点组合与序列化。
- ✅ 领域层仍保持框架无关；本次未引入领域层变更。
- ✅ 未重复或修改 Desktop 与 Frontend 运行界面。
- ✅ `artifacts/05-code/` 包含实现说明、测试结果和剩余风险说明。
- ✅ 已生成评审工件：`artifacts/06-reviews/review-round0.md`。

## 验证复跑

评审过程中复跑了以下命令：

```sh
cargo test -p evidence-server-api
cargo test -p evidence-server
cargo fmt -p evidence-server-api -- --check
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo test -p evidence-server --features postgres-tests
pnpm api:contracts
```

结果：

- ✅ `cargo test -p evidence-server-api` 通过：4 个单元测试 + 1 个集成测试。
- ✅ `cargo test -p evidence-server` 通过。
- ✅ `cargo fmt -p evidence-server-api -- --check` 通过。
- ✅ `cargo clippy -p evidence-server --all-targets -- -D warnings` 通过。
- ✅ `cargo test -p evidence-server --features postgres-tests` 针对 `evidence-server` package target 通过。
- ✅ `pnpm api:contracts` 成功完成，不过当前配置的 Vitest contract suite 中有 3 个测试处于 skipped 状态。

## 发现问题

### Critical

无。

### Major

无。

### Minor

1. `pnpm api:contracts` 可以成功执行，但当前配置的 3 个 API contract 测试全部被跳过。这不阻塞 US-001，因为新增的 Rust 集成测试已经直接验证了 root contract；但后续 API contract 质量门应考虑恢复这些 skipped 测试，或用新的契约检查替代。
2. 架构工件中仍有部分旧示例指向 `apps/server/src/api/`，而当前实际工作区已经拆分为 `libs/server/api/src/` 等后端 crate。本次编码变更正确遵循了当前活跃 crate 布局，且 module-structure 工件也允许 `libs/` 变更；但后续架构清理应在所有位置明确后端拆分结构。

## 结论

评审通过。编码阶段满足 US-001 的完成定义，可以作为已完成阶段继续推进。当前没有 Critical 或 Major 阻塞问题；Minor 观察项不阻塞本次完成，但建议作为后续清理事项跟踪。
