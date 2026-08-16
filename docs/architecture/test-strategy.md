# Evidence 测试策略

本文件定义跨 Feature 共享的质量反馈结构。场景只选择功能上下文和工序，不重新设计测试体系。

## 测试四象限

- **Q1：技术导向、支持团队**——领域、组件、resource、mapper 和 adapter 的快速定位测试。
- **Q2：业务导向、支持团队**——从 Given/When/Then 验收示例派生的场景测试。
- **Q3：业务导向、评价产品**——探索性、可用性、可访问性和兼容性评价。
- **Q4：技术导向、评价产品**——性能、安全、可靠性和可运维性评价。
- Q3/Q4 按风险补充但不替代 Q1/Q2。

## 追踪规则

```text
SC-xxx → confirmed model refs → Q2/Q1 tests → ordered TASK/TEST units
       → owning runtime/functional contexts → test doubles/test processes
       → Red/Green/Refactor changed paths → quality gates
```

Q2 失败时，应至少有一个更细粒度 Q1 测试帮助定位。

## Runtime 策略

| Runtime / 边界 | 主要 Q1                                   | 主要 Q2                                    |
| -------------- | ----------------------------------------- | ------------------------------------------ |
| Web            | component/hook/resource tests             | rendered route/feature scenario            |
| Java Server    | domain/application/resource/adapter tests | Spring Boot/Jersey black-box REST contract |
| Electron       | main/preload/lifecycle/security tests     | packaged renderer + configured API smoke   |
| PostgreSQL     | MyBatis mapper/repository tests           | migrated Testcontainer/contracts           |
| Filesystem     | temporary directory adapter tests         | Workspace model projection scenarios       |
| Pi integration | Desktop session、tools、controller tests  | packaged Desktop 或本地 Agent probe        |

## Contract gates

- `libs/contracts/evidence.openapi` 是唯一 OpenAPI source；生成的 Web schema 必须同步。
- `pnpm api:contracts` 构建并启动 Java Server，连接可丢弃 PostgreSQL，对完整 REST/HAL surface 运行 TypeScript 黑盒套件。
- Java Server 启动时通过 Flyway 建立或升级 contract database；contracts 不运行第二套 migration 工具。
- Web client 由 OpenAPI 生成；类型检查不能替代运行时 contract test。
- Electron package smoke 使用受控 fake API 验证 packaged renderer、受限 preload、嵌入 Pi SDK 和远程 API readiness。

## Java Server 回归门禁

- Flyway 从 `V001__initial_schema.sql` 建立全新 PostgreSQL；后续 schema 变更只能追加 migration。
- REST/HAL 的状态码、vendor media type、链接、分页和错误响应由 `pnpm api:contracts` 验证。
- canonical JSON 与权威内容 hash 由 Java Domain 测试固定，持久化层不得定义第二套 hash 算法。
- PostgreSQL 行为使用 Testcontainers 验证，不维护旧服务端或旧数据库实现的兼容分支。

## 执行原则

- 先运行最小聚焦测试，再运行工序声明的完整质量门禁。
- Red 必须因预期业务行为缺失而失败，不接受依赖、配置、timeout 或进程启动错误伪装成 Red。
- Story iteration 使用受控执行工具记录命令、退出码和工作树哈希。
- Showcase 必须重新执行已选 Q2；命令全绿不等于价值已验证。
- PostgreSQL、Desktop Pi 或平台 package gate 无法运行时必须明确风险，不能用 fake 冒充真实边界。
