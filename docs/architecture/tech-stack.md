# Evidence 技术栈

版本事实以 `pnpm-lock.yaml`、package manifests 和项目配置为准；本文件只记录技术选择及使用边界。

| 区域          | 技术                                                        | 约束                                               |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Monorepo      | Nx、pnpm、TypeScript                                        | 使用项目 target 和 `workspace:*`，不绕过依赖边界   |
| Web           | React、Vite、TypeScript、React Router                       | 组合根在 `apps/web`，功能位于 `libs/web/*`         |
| UI            | Tailwind CSS、shadcn/ui、AI Elements                        | UI 组件不承载领域规则                              |
| Server        | NestJS、TypeScript、RxJS                                    | 唯一 Server runtime；controller 保持轻量           |
| Persistence   | Prisma、PostgreSQL、filesystem YAML                         | schema 通过受版本控制的 Prisma migrations 演进     |
| Desktop       | Electron、electron-builder                                  | 安全 main/preload；复用 Web；连接配置的 Server API |
| Local agents  | Desktop embedded Pi SDK `AgentSession`、受限 IPC events     | Server 不加载 Pi；会话支持取消，工具受本地边界约束 |
| Coding VCS    | Git branch/worktree                                         | 每个 CodingRun 隔离；人工接受后才创建本地 commit   |
| Contract      | OpenAPI YAML、openapi-typescript                            | Nest 拥有 source；发布副本和生成类型不可手改       |
| Test          | Vitest、Testing Library、black-box contracts、package smoke | Q1/Q2 和替身遵循统一测试策略                       |
| 内部 Workflow | Pi extension、Skills、GitHub/Markdown/JSON evidence         | 只辅助本仓库研发，不属于产品 runtime               |

## Runtime 约束

- Node.js 22+、pnpm 10+。
- Server 只使用 PostgreSQL；Desktop 不包含 Server 或数据库。
- Electron package 必须包含 Web、运行依赖和 Pi SDK，并通过 `EVIDENCE_API_BASE_URL` 连接 Server；Server package 不包含 Pi SDK。
- Browser 与 Electron renderer 共享 REST/HAL；IPC 不复制 domain API。

## 技术选择变更

Feature 不得直接在 iteration 中重写技术栈。需要新增或替换技术时，在 `architecture-decisions.md` 说明动机、替代方案、影响和回滚方式，经人工接受后再更新本文件及真实配置。
