# Evidence 技术栈

版本事实以 lockfile、Cargo manifests 和项目配置为准；本文件只记录技术选择及使用边界。

| 区域        | 技术                                                       | 约束                                              |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------- |
| Monorepo    | Nx、pnpm、Cargo workspace                                  | 使用项目 target，不绕过 workspace 依赖边界        |
| Web         | React、Vite、TypeScript、React Router                      | 组合根在 `apps/web`，功能位于 `libs/web/*`        |
| UI          | Tailwind CSS、shadcn/ui、AI Elements                       | UI 组件不承载领域规则                             |
| Rust Server | Axum、Tokio、SeaORM、PostgreSQL                            | Domain trait first；API handler 保持轻量          |
| Nest Server | NestJS、Prisma、TypeScript                                 | 独立实现轨道，不与 Rust 模块混合实现同一 Feature  |
| Desktop     | Tauri 2、Rust                                              | 复用 Web 前端；能力使用 capability/command 暴露   |
| Contract    | OpenAPI YAML、openapi-typescript                           | `contracts/api.yaml` 是契约文件，生成类型不可手改 |
| Test        | Vitest、Testing Library、Cargo test、契约测试              | Q1/Q2 和测试替身遵循统一测试策略                  |
| Workflow    | Pi extension、Skills、GitHub Issue、Markdown/JSON evidence | 稳定知识统一维护，执行证据按 iteration 隔离       |

## 技术选择变更

Feature 不得在 iteration 中复制或重写技术栈。需要新增或替换技术时，在 `04-design/delivery-plan.md` 说明动机、替代方案、影响和回滚方式；经场景验证与 Showcase 反馈后再更新本文件及真实配置。
