# Sprint 1 Backlog

Sprint 1 聚焦 **工作区与逻辑实体基础闭环**。本文件将 Product Backlog 中的 PBI 拆成可执行开发任务，并给出验收标准和建议验证命令。

## Sprint 1 用户故事

### US-001 / PBI-001：API Root 默认入口

**用户故事**：作为用户，我希望通过 `/api` 获取 default-user 链接，以便快速进入 Evidence。

**验收标准**：

- `GET /api` 返回 `_links.self`。
- `GET /api` 返回 `_links.health`。
- `GET /api` 返回 `_links.default-user`，目标为 `/api/users/desktop-user`。
- 响应结构与 README 示例一致。

**任务**：

| Task ID | 任务                                  | 文件区域               | 验证                        |
| ------- | ------------------------------------- | ---------------------- | --------------------------- |
| S1-T001 | 检查 API root handler                 | `apps/server/src/api/` | `curl /api` 或 handler test |
| S1-T002 | 补齐 HAL links                        | `apps/server/src/api/` | cargo test                  |
| S1-T003 | 如有 OpenAPI 导出，确认 root contract | `contracts/api.yaml`   | `pnpm api:export`           |

### US-002 / PBI-002：默认用户看到默认工作区

**用户故事**：作为用户，我希望默认用户能看到默认工作区，以便无需配置即可开始建模。

**验收标准**：

- `desktop-user` seed 存在。
- `default-workspace` seed 存在。
- `desktop-user` 是 `default-workspace` owner。
- fake store contract 覆盖该行为。
- PostgreSQL contract 在启用 `postgres-tests` 时覆盖该行为。

**任务**：

| Task ID | 任务                                     | 文件区域                                     | 验证       |
| ------- | ---------------------------------------- | -------------------------------------------- | ---------- |
| S1-T004 | 检查 seed data 初始化                    | `apps/server/src/persistent/store.rs`        | cargo test |
| S1-T005 | 检查 fake store seed                     | `apps/server/src/persistent/test_support.rs` | cargo test |
| S1-T006 | 确认 `user_sees_seed_workspace` contract | `persistent/test_support.rs::contracts`      | cargo test |

### US-003 / PBI-003：创建工作区并自动添加 owner

**用户故事**：作为用户，我希望创建新工作区，以便隔离不同业务领域模型。

**验收标准**：

- `POST /api/users/{userId}/workspaces` 可创建工作区。
- 创建者自动成为 owner member。
- 重复成员返回 Conflict。
- fake/PostgreSQL 行为一致。

**任务**：

| Task ID | 任务                            | 文件区域                                | 验证                                   |
| ------- | ------------------------------- | --------------------------------------- | -------------------------------------- |
| S1-T007 | 检查 UserWorkspaces create 行为 | `domain/user.rs`、`persistent/users.rs` | contract tests                         |
| S1-T008 | 检查 owner member 创建          | `persistent/`                           | `creating_workspace_adds_owner_member` |
| S1-T009 | 检查 duplicate member conflict  | `persistent/test_support.rs`            | `duplicate_member_is_conflict`         |
| S1-T010 | 补齐 API handler 错误映射       | `api/`                                  | handler/API test                       |

### US-004 / PBI-004：创建逻辑实体

**用户故事**：作为领域建模负责人，我希望创建逻辑实体，以便记录业务概念及其定义。

**验收标准**：

- 支持 `EVIDENCE`、`PARTICIPANT`、`ROLE`、`CONTEXT`。
- 子类型与主类型兼容。
- 可保存 definition、attributes、behaviors、tags。
- 创建后返回 HAL resource。

**任务**：

| Task ID | 任务                                  | 文件区域                                   | 验证           |
| ------- | ------------------------------------- | ------------------------------------------ | -------------- |
| S1-T011 | 检查 LogicalEntity domain type        | `apps/server/src/domain/logical_entity.rs` | cargo test     |
| S1-T012 | 检查 create persistent implementation | `apps/server/src/persistent/`              | contract tests |
| S1-T013 | 补齐 type/subType validation          | domain/persistent                          | unit tests     |
| S1-T014 | 补齐 POST API response links          | `apps/server/src/api/`                     | API test       |

### US-005 / PBI-005：列出逻辑实体

**用户故事**：作为业务分析师，我希望查看工作区逻辑实体列表，以便理解模型范围。

**验收标准**：

- `GET /api/workspaces/{id}/logical-entities` 返回集合。
- 支持 `page`、`pageSize`。
- 返回 `_embedded` 和 `page`。
- 不返回 soft-deleted records。

**任务**：

| Task ID | 任务                           | 文件区域      | 验证           |
| ------- | ------------------------------ | ------------- | -------------- |
| S1-T015 | 检查 list query 和 pagination  | `persistent/` | contract tests |
| S1-T016 | 检查 HAL collection serializer | `api/`        | API test       |
| S1-T017 | 补齐 deleted_at 过滤           | `persistent/` | cargo test     |

### US-006 / PBI-006：更新逻辑实体

**用户故事**：作为业务分析师，我希望更新逻辑实体定义、属性、行为和标签，以便持续修正模型。

**验收标准**：

- `PUT /api/workspaces/{id}/logical-entities/{eid}` 可更新描述字段。
- 不存在实体返回 NotFound。
- 非法类型/子类型返回 Validation。
- 更新后读取结果一致。

**任务**：

| Task ID | 任务                               | 文件区域          | 验证           |
| ------- | ---------------------------------- | ----------------- | -------------- |
| S1-T018 | 检查 update domain/persistent 行为 | domain/persistent | contract tests |
| S1-T019 | 补齐 NotFound/Validation 映射      | api/domain        | cargo test     |
| S1-T020 | 检查 update 后 HAL resource        | api               | API test       |

### PBI-016/PBI-017：契约测试质量门

**目标**：fake store 与 PostgreSQL 在 workspace 和 logical entity 行为上保持一致。

**任务**：

| Task ID | 任务                                    | 文件区域                                | 验证                                                      |
| ------- | --------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| S1-T021 | 整理 workspace contract tests           | `persistent/test_support.rs::contracts` | cargo test                                                |
| S1-T022 | 整理 logical entity CRUD contract tests | `persistent/test_support.rs::contracts` | cargo test                                                |
| S1-T023 | 确认 fake implementation 全部通过       | `persistent/test_support.rs`            | `cargo test -p evidence-server`                           |
| S1-T024 | 尝试 PostgreSQL feature tests           | `persistent/users.rs` 等                | `cargo test -p evidence-server --features postgres-tests` |

## Sprint 1 开发顺序

1. 先跑现有测试，确认基线。
2. 检查 root/default-user/default-workspace 行为。
3. 补强 workspace 创建与 owner member contract。
4. 补强 logical entity CRUD contract。
5. 再修 API/HAL response 和 OpenAPI 导出。
6. 最后记录 `artifacts/05-code/` 实现说明和测试结果。

## 建议验证命令

```sh
cargo test -p evidence-server
cargo clippy -p evidence-server --all-targets -- -D warnings
pnpm api:export
pnpm api:generate
pnpm test
pnpm typecheck
pnpm lint
```

PostgreSQL 环境可用时：

```sh
cargo test -p evidence-server --features postgres-tests
```

## Sprint 1 Definition of Ready

- 需求、领域模型、架构工件已完成并审核通过。
- Sprint 1 Backlog 中每个故事都有验收标准。
- 代码改动范围限定在当前故事所需模块。
- PostgreSQL 环境若不可用，需要在实现说明中记录。

## Sprint 1 Definition of Done

- 所选 PBI 有真实源码和测试变更。
- fake store contract tests 通过。
- PostgreSQL contract tests 可运行则通过，不可运行则记录原因。
- API response 保持 HAL 风格。
- 无新增未解释的 `TODO`、`panic` 或硬编码临时逻辑。
- `artifacts/05-code/` 包含实现记录、测试结果和剩余风险。
