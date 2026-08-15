# Evidence 测试策略

本文件定义跨 Feature 共享的质量反馈结构。场景只负责选择功能上下文和工序，不重新设计整套测试策略。

## 测试四象限

- **Q1：技术导向、支持团队**——领域、组件、资源 adapter、持久化契约等快速定位测试。
- **Q2：业务导向、支持团队**——从 Given/When/Then 验收示例派生的场景测试。
- **Q3：业务导向、评价产品**——探索性、可用性、可访问性和兼容性评价。
- **Q4：技术导向、评价产品**——性能、安全、可靠性和可运维性评价。
- Q3/Q4 按风险补充但不替代 Q1/Q2；每个 Scenario 都必须显式记录 `not_required`（含理由）或 `required`（含具体评价活动）。

## 追踪规则

每个计划场景必须形成：

```text
SC-xxx → confirmed model refs → Q2/Q1 tests → ordered TASK/TEST units
       → owning runtime/functional contexts → test doubles/test processes
       → Red/Green/Refactor changed paths → quality gates
```

Q2 失败时，应至少有一个更细粒度 Q1 测试帮助定位；低价值薄协议层可以与相邻上下文合并测试，但必须在场景映射中明确。

## Runtime 策略

| Runtime / 边界 | 主要 Q1                                      | 主要 Q2                                               |
| -------------- | -------------------------------------------- | ----------------------------------------------------- |
| Web            | component/hook/resource tests                | rendered route/feature scenario                       |
| Nest Server    | domain、controller、repository/adapter tests | composed module 或 black-box REST contract            |
| Electron       | main/preload/lifecycle/security tests        | packaged renderer + configured API smoke              |
| PostgreSQL     | mapper/repository tests                      | migrated temporary database contracts                 |
| Filesystem     | temporary directory adapter tests            | Workspace model projection scenarios                  |
| Pi integration | Desktop session、受限工具与 controller tests | packaged Desktop smoke 或有配置的真实本地 Agent probe |

## Contract gates

- `libs/server/api/openapi.yaml` 是唯一 OpenAPI source；生成的 Web schema 必须与其同步。
- contract runner 连接已迁移的临时 PostgreSQL 并启动唯一 Nest Server，黑盒验证 Workspace、Member、Inbox Extraction、Candidate 决定/selection、Frozen Intake、Kickoff、Understand、Tasking、Pair、Showcase、Respond、Diagram、Relationship、错误与 media type；Server contract 不启动 Pi provider。
- PostgreSQL CI 先运行 `prisma migrate deploy`，再运行 migration/contract gates。
- Web client 由 OpenAPI 生成；类型检查不能替代运行时 contract test。
- Electron package smoke 使用受控 fake API 验证内嵌 Pi SDK、packaged renderer 和远程 API readiness。

## Server replacement 兼容性基线

`libs/contracts/api-contracts/baseline/` 保存替换 Nest runtime 时必须跨语言复现的 `nest-compatibility-v1`：

- `compatibility-v1.json` 固定 OpenAPI source、Prisma schema、已有 migration chain，以及迁移后 PostgreSQL 的逐表 columns、constraints、indexes 摘要；新增 migration 只能追加在基线版本之后，历史 migration 不得改写。
- `hal-goldens.json` 固定认证失败、HAL resource、HAL collection、分页、模板、领域错误和 `204` 的代表性 wire response；只规范化随机 Workspace ID 与 RFC 3339 时间戳。
- `hash-vectors.json` 固定 canonical JSON 和 Candidate、Intake、Kickoff 权威内容 hash，供当前 TypeScript 与未来 Java 实现共同消费。
- `database-catalog.sql` 是语言无关的 PostgreSQL catalog 投影；忽略 Prisma/Flyway 自身的 migration bookkeeping table。

静态基线运行 `pnpm compatibility:check`。运行时 HAL 与 database catalog 基线包含在 `pnpm api:contracts` 中，必须连接已迁移的 disposable PostgreSQL。协议、schema 或 hash 语义有意变化时，必须先审查兼容性影响，再显式发布下一版基线；不得用覆盖 golden 的方式掩盖意外漂移。

## 执行原则

- 先运行最小聚焦测试，再运行工序声明的完整质量门禁。
- Red 必须因为预期业务行为尚未实现而失败，不接受依赖、配置、timeout 或进程启动错误伪装成 Red。
- Story iteration 使用受控执行工具记录命令、退出码和工作树哈希。
- Showcase 必须重新执行已选 Q2，并由人类把实际产品观察映射回确认的 Given/When/Then、业务数据和价值反馈；命令全绿不等于价值已验证。
- PostgreSQL、Desktop Pi 或平台 package gate 无法运行时必须明确风险，不能用 fake 结果冒充真实边界证明。
- 质量命令由 workspace package scripts 与 Nx targets 管理；按变更边界选择 Web、Nest、Electron、PostgreSQL 或契约门禁。
