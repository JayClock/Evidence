# Sprint 计划

## Sprint 目标

Sprint 1 的目标是完成 **工作区与逻辑实体基础闭环**，让用户可以通过默认入口进入工作区，查看和维护逻辑实体，并用契约测试保护 fake store 与 PostgreSQL 的一致行为。

## Sprint 范围

| 范围       | 内容                                                         |
| ---------- | ------------------------------------------------------------ |
| 主题       | MVP-1：工作区与逻辑实体基础闭环                              |
| 时间盒     | 1 个短迭代，可按团队节奏映射到 1-2 周                        |
| 重点上下文 | Identity & Workspace、Modeling Core、Persistence & Contracts |
| 不包含     | 完整图画布体验、复杂 UI 编辑器、协同编辑、权限系统细化       |

## Sprint Backlog 摘要

| PBI ID  | 标题                        | 优先级 | 估算 | Sprint 选择原因                        |
| ------- | --------------------------- | ------ | ---- | -------------------------------------- |
| PBI-001 | API root default-user 入口  | P0     | 2    | 支撑默认进入路径。                     |
| PBI-002 | 默认用户看到默认工作区      | P0     | 3    | 验证 seed data 与 workspace contract。 |
| PBI-003 | 创建工作区并添加 owner      | P0     | 5    | 核心协作边界。                         |
| PBI-004 | 创建逻辑实体                | P0     | 5    | Modeling Core 核心能力。               |
| PBI-005 | 列出逻辑实体                | P0     | 3    | 支撑前端浏览和模型评审。               |
| PBI-006 | 更新逻辑实体                | P0     | 5    | 支撑模型迭代。                         |
| PBI-016 | Workspace 契约测试          | P0     | 5    | 保障 fake/Postgres 一致性。            |
| PBI-017 | LogicalEntity CRUD 契约测试 | P0     | 5    | 保障核心模型行为。                     |
| PBI-020 | Evidence Workflow 前缀定制  | P1     | 2    | 已完成，纳入审计闭环。                 |

总估算：35 点。若团队容量不足，优先保留 PBI-001、PBI-002、PBI-004、PBI-005、PBI-016、PBI-017。

## Sprint 交付物

- 可运行的默认用户/默认工作区入口。
- 工作区创建时 owner 成员行为稳定。
- 逻辑实体创建、读取、更新、删除或至少 CRUD 主路径稳定。
- fake store 与 PostgreSQL 对 workspace 和 logical entity 行为共享契约测试。
- API 响应保持 HAL 风格。
- Evidence Workflow 工件状态推进到 coding 或 review 阶段。

## 迭代任务分解

### 1. 工作区入口与默认数据

| Task ID | 任务                                                 | 输出                              |
| ------- | ---------------------------------------------------- | --------------------------------- |
| T-001   | 检查 `/api` root resource 和 default-user 链接       | API root 行为确认或修复。         |
| T-002   | 检查 `desktop-user` 与 `default-workspace` seed data | seed data 与契约测试一致。        |
| T-003   | 补强用户工作区列表 HAL collection                    | `_embedded`、`page`、links 一致。 |

### 2. 工作区创建与成员关系

| Task ID | 任务                           | 输出                     |
| ------- | ------------------------------ | ------------------------ |
| T-004   | 检查/实现工作区创建路径        | 创建 workspace。         |
| T-005   | 确保创建者自动成为 owner       | owner member contract。  |
| T-006   | 覆盖 duplicate member conflict | fake/Postgres 行为一致。 |

### 3. 逻辑实体 CRUD

| Task ID | 任务                                               | 输出                                |
| ------- | -------------------------------------------------- | ----------------------------------- |
| T-007   | 检查/实现 logical entity create/list/update/delete | 核心 CRUD 行为。                    |
| T-008   | 实现 type/subType 校验                             | Validation 行为稳定。               |
| T-009   | 确保 logical entity HAL links                      | self、collection、workspace links。 |
| T-010   | 补齐 pagination 行为                               | page/pageSize 行为一致。            |

### 4. 契约测试与质量门

| Task ID | 任务                                 | 输出                                                        |
| ------- | ------------------------------------ | ----------------------------------------------------------- |
| T-011   | 扩展 fake store contract tests       | fast tests 覆盖核心行为。                                   |
| T-012   | 扩展 PostgreSQL contract tests       | feature-gated 集成测试。                                    |
| T-013   | 运行 `cargo test -p evidence-server` | 后端测试通过或记录阻塞。                                    |
| T-014   | 运行前端/工作区质量命令              | `pnpm test`、`pnpm lint`、`pnpm typecheck` 视改动范围执行。 |

## 风险与应对

| 风险                                         | 影响                    | 应对                                                       |
| -------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| 当前实现已部分完成，任务边界不清             | 重复实现或覆盖已有逻辑  | 先读现有 domain/api/persistent，再最小修改。               |
| PostgreSQL integration 环境不可用            | 无法验证 postgres-tests | 保留 fake contract 测试，并记录 `TEST_DATABASE_URL` 阻塞。 |
| LogicalEntity 类型结构与 API contract 不一致 | 前端和后端类型漂移      | 以 domain 类型和 OpenAPI 导出为准。                        |
| Nest/Prisma 实验入口干扰                     | 误选后端实现主线        | Sprint 1 聚焦 Rust Axum 主后端。                           |

## Sprint 成功判定

- 所有 Sprint P0 PBI 有真实代码和测试结果。
- fake store contract tests 全部通过。
- PostgreSQL contract tests 能运行则通过；不能运行则记录环境阻塞。
- API root、workspace、logical entity 仍保持 HAL 风格。
- 没有新增 `# TODO` 作为交付替代。
- `artifacts/05-code/` 记录编码阶段实现说明和测试结果。
