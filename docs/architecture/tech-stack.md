# Evidence 技术栈

版本事实以 `pnpm-lock.yaml`、Gradle dependency management、package manifests 和项目配置为准；本文件只记录技术选择及边界。

| 区域         | 技术                                                    | 约束                                               |
| ------------ | ------------------------------------------------------- | -------------------------------------------------- |
| Monorepo     | Nx、pnpm、Gradle                                        | 所有构建通过 project targets；Java 依赖使用 Gradle |
| Web          | React、Vite、TypeScript、React Router                   | 组合根在 `apps/web`，功能位于 `libs/web/*`         |
| UI           | Tailwind CSS、shadcn/ui、AI Elements                    | UI 组件不承载领域规则                              |
| Server       | Java 17+、Spring Boot、Jersey/JAX-RS、Smart Domain      | 唯一 Server runtime；resource 保持轻量             |
| Application  | Spring transactions、framework-facing ports             | 拥有 use case、授权与事务边界                      |
| Persistence  | MyBatis、Flyway、PostgreSQL、Jackson YAML、Java NIO     | migration 只追加；不使用 Hibernate 自动建表        |
| Security     | Spring Security、OAuth2 Resource Server                 | local/OIDC adapter 不进入 domain                   |
| Desktop      | Electron、electron-builder                              | 安全 main/preload；复用 Web；连接配置的 Server API |
| Local agents | Desktop embedded Pi SDK `AgentSession`、受限 IPC events | Server 不加载 Pi；工具受本地边界约束               |
| Delivery VCS | Git branch/worktree                                     | 每张活动 Story 隔离；人工批准后才创建本地 commit   |
| Contract     | OpenAPI、openapi-typescript、HAL black-box contracts    | `libs/contracts/evidence.openapi` 是唯一 source    |
| Test         | JUnit 5、Testcontainers、Vitest、Testing Library、smoke | Q1/Q2 和替身遵循统一测试策略                       |

## Runtime 约束

- Java 17+、Node.js 22+、pnpm 10+。
- Server 只使用 PostgreSQL；Desktop 不包含 Server 或数据库。
- Electron package 包含 Web、运行依赖和 Pi SDK，通过 `EVIDENCE_API_BASE_URL` 连接 Server。
- Browser 与 Electron renderer 共享 REST/HAL；IPC 不复制 domain API。
- Java 格式化使用 Spotless/Google Java Format；TypeScript 使用 workspace ESLint/Prettier/Biome 配置。

## 技术选择变更

Feature 不得直接重写技术栈。新增或替换技术时，应说明动机、替代方案、影响和回滚方式，经人工接受后再更新本文件及真实配置。
