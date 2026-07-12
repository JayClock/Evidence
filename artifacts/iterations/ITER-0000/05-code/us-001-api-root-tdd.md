# US-001 API Root 默认入口 — TDD 实现记录

## 选择的 Sprint 1 故事

- 故事：US-001 / PBI-001：API Root 默认入口
- 原因：Sprint 1 Backlog 中第一个入口故事，现有实现已有 handler，但缺少真实 API contract 测试覆盖。

## Red

新增真实测试文件：

- `libs/server/api/tests/root_contract.rs`

测试覆盖：

- `GET /api` 返回 `200 OK`。
- 响应 `Content-Type` 为 `application/vnd.evidence.root+json`。
- 响应体严格匹配 HAL root contract：
  - `_links.self.href = /api`
  - `_links.health.href = /health`
  - `_links.default-user.href = /api/users/desktop-user`

首次运行定向测试时失败，原因是 integration test 需要 `tower::util::ServiceExt`，但 `evidence-server-api` 未声明 `tower` dev-dependency。

## Green

最小实现/修复：

- 在 `libs/server/api/Cargo.toml` 增加 `tower = { version = "0.5", features = ["util"] }` dev-dependency，支持真实 Router integration test。
- 保留现有 `/api` handler 行为，使新增 contract test 通过。

## Refactor

小幅结构改善：

- 在 `libs/server/api/src/api/root.rs` 增加 `DEFAULT_USER_ID` 常量。
- 将 root handler 中的 `desktop-user` 字面量替换为常量，保持 contract 语义不变并降低重复硬编码风险。

## 验证结果

已运行：

```sh
cargo test -p evidence-server-api get_api_returns_default_entrypoint_links
cargo fmt -p evidence-server-api
cargo test -p evidence-server-api
cargo test -p evidence-server
cargo clippy -p evidence-server-api --all-targets -- -D warnings
cargo test -p evidence-server --features postgres-tests
cargo fmt -p evidence-server-api -- --check
cargo clippy -p evidence-server --all-targets -- -D warnings
```

结果：

- `evidence-server-api` 测试通过：4 个单元测试 + 1 个新增 integration test。
- `evidence-server` 测试通过。
- `evidence-server-api` clippy 通过，`-D warnings` 无告警。
- `evidence-server` clippy 通过，`-D warnings` 无告警。
- PostgreSQL feature test 命令可运行并通过；当前 `evidence-server` crate 本身无测试用例，但 feature 编译与 doc tests 通过。
- `cargo fmt --check` 通过。

## 风险与后续

- US-001 已有 root handler 行为，本阶段重点是补齐真实 API contract 测试与可维护性小重构。
- 后续 Sprint 1 可继续 US-002 / US-003，补强默认工作区与 workspace owner contract 的端到端/API 层覆盖。
