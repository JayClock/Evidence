# 技术栈

本文记录 Evidence 当前项目技术栈，并区分主路径、辅助工具和后续约束。

## 总览

| 层级        | 技术                                                               | 当前用途                             |
| ----------- | ------------------------------------------------------------------ | ------------------------------------ |
| Monorepo    | Nx 22、pnpm workspace                                              | 管理 Web、Server、Desktop 和库项目。 |
| Web         | React 19、Vite、TypeScript、react-router-dom                       | 单页前端应用。                       |
| Desktop     | Tauri 2、Rust                                                      | 桌面壳，复用 Web 前端。              |
| Server      | Rust、Axum                                                         | 主后端 REST/HAL API。                |
| Persistence | SeaORM、PostgreSQL                                                 | 生产持久化和 schema 初始化。         |
| Contracts   | OpenAPI YAML、openapi-typescript                                   | API 契约导出和前端类型生成。         |
| Testing     | Vitest、Testing Library、cargo test、contract tests                | 前端、后端、持久化契约测试。         |
| Quality     | ESLint、Prettier、cargo fmt、cargo clippy、lint-staged、commitlint | 代码质量和提交规范。                 |
| Workflow    | Evidence Workflow `.pi/`、Markdown artifacts                       | 需求到评审的审计工作流。             |

## 前端技术栈

| 技术             | 版本/来源      | 用途             | 约束                                         |
| ---------------- | -------------- | ---------------- | -------------------------------------------- |
| React            | `package.json` | UI 组件和交互。  | 业务规则不放在组件内部。                     |
| React DOM        | `package.json` | 浏览器渲染。     | 与 React 版本保持一致。                      |
| react-router-dom | `package.json` | SPA 路由。       | 路由应服务领域视图，如工作区、图、逻辑实体。 |
| Vite             | `package.json` | Web dev/build。  | Tauri dev/build 依赖 Web 输出。              |
| TypeScript       | `package.json` | 前端类型系统。   | API 类型优先来自生成 client。                |
| Vitest           | `package.json` | 前端测试。       | UI 逻辑和关键页面应覆盖。                    |
| Testing Library  | `package.json` | React 组件测试。 | 以用户行为为中心测试。                       |
| Tailwind CSS     | `package.json` | 样式基础。       | 保持组件语义清晰。                           |

## 后端技术栈

| 技术             | 用途                         | 约束                                                          |
| ---------------- | ---------------------------- | ------------------------------------------------------------- |
| Rust             | 主后端和 Tauri shell。       | 使用 workspace 管理 `evidence-server` 和 `evidence-desktop`。 |
| Axum             | HTTP routing 和 middleware。 | Handler 保持轻量，业务规则委托 domain。                       |
| SeaORM           | PostgreSQL ORM。             | SeaORM entity 不直接泄漏到 API/domain。                       |
| PostgreSQL       | 生产持久化。                 | 集成测试通过 feature gate 或 TEST_DATABASE_URL 控制。         |
| async_trait      | domain trait 异步抽象。      | trait 应表达领域能力，而不是数据库操作细节。                  |
| chrono/time 相关 | RFC3339 时间戳。             | 时间统一使用 RFC 3339 字符串。                                |

## 桌面技术栈

| 技术               | 用途                 | 约束                               |
| ------------------ | -------------------- | ---------------------------------- |
| Tauri 2            | 桌面壳。             | 不引入第二套前端业务。             |
| Tauri capabilities | 权限控制。           | 默认 capability 包含 core/opener。 |
| Vite dev server    | 桌面开发时加载前端。 | 默认 `http://127.0.0.1:4200`。     |
| Web dist           | 桌面构建时打包。     | build 前必须先构建 `apps/web`。    |

## 契约与生成

| 工具/文件                                       | 用途                                    |
| ----------------------------------------------- | --------------------------------------- |
| `contracts/api.yaml`                            | 当前 API 契约快照。                     |
| `pnpm api:export`                               | 从 Rust server 导出 OpenAPI。           |
| `pnpm api:generate`                             | 导出 OpenAPI 并生成 TypeScript client。 |
| `libs/web/api-client/src/lib/openapi-schema.ts` | 生成的前端 API 类型。                   |
| `pnpm api:contracts`                            | API 契约检查入口。                      |

## 质量命令

| 命令                                                           | 用途                                                |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `pnpm lint`                                                    | 运行 Nx lint，包括前端 ESLint 和 Rust clippy 入口。 |
| `pnpm typecheck`                                               | TypeScript 类型检查，前置 Prisma generate。         |
| `pnpm test`                                                    | 前端 Vitest + Rust cargo test。                     |
| `cargo test -p evidence-server`                                | 后端测试。                                          |
| `cargo test -p evidence-server --features postgres-tests`      | PostgreSQL 集成/契约测试。                          |
| `cargo clippy -p evidence-server --all-targets -- -D warnings` | 后端 lint。                                         |
| `cargo fmt --all -- --check`                                   | Rust 格式检查。                                     |

## 依赖边界

| 来源                               | 可以依赖                                                      | 不应依赖                               |
| ---------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `apps/web`                         | generated API client、UI libs、React ecosystem                | Rust domain internals、数据库 schema。 |
| `apps/desktop`                     | `apps/web` build output、Tauri APIs                           | 独立业务前端。                         |
| `apps/server/src/api`              | domain traits、persistent store handle、serialization helpers | 前端组件、直接数据库 SQL 业务逻辑。    |
| `apps/server/src/domain`           | Rust std、领域核心抽象                                        | Axum、SeaORM、PostgreSQL、Tauri。      |
| `apps/server/src/persistent`       | domain traits、SeaORM、PostgreSQL                             | API DTO、前端类型。                    |
| `.pi/extensions/evidence-workflow` | local file artifacts、workflow state                          | 产品运行时核心逻辑。                   |

## 技术债观察

| 观察                                       | 风险                                | 建议                                                    |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------- |
| `package.json` 中存在 Nest/Prisma 相关脚本 | 可能与 Rust Axum 主后端形成双轨混淆 | 明确 `server-nest` 是否实验性；若保留需写入单独上下文。 |
| API contract 需要手动导出/生成             | 容易和实现漂移                      | 将 `api:generate` 纳入 PR 检查。                        |
| 图建模前端复杂度会上升                     | 状态和交互可能膨胀                  | 提前定义 diagram view model 和组件边界。                |
| 逻辑实体类型体系可能增长                   | 枚举和验证分散                      | 集中在 domain 层维护类型兼容规则。                      |
