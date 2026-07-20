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

| Runtime / 边界    | 主要 Q1                                      | 主要 Q2                                                 |
| ----------------- | -------------------------------------------- | ------------------------------------------------------- |
| Web               | component/hook/resource tests                | rendered route/feature scenario                         |
| Nest Server       | domain、controller、repository/adapter tests | composed module 或 black-box REST/SSE contract          |
| Electron          | main/preload/lifecycle/security tests        | packaged renderer + managed Nest smoke                  |
| PostgreSQL        | mapper/repository tests                      | migrated temporary database contracts                   |
| SQLite/filesystem | temporary registry/directory tests           | Desktop local API scenario                              |
| Pi integration    | fake JSONL process mapping tests             | authenticated SSE fixture 或有配置的真实 proposal probe |

## Contract gates

- `libs/server/api/openapi.yaml` 与 `contracts/api.yaml` 必须 byte-for-byte 同步。
- 本地 contract runner 启动 SQLite Nest child 和 fake OpenAI-compatible Pi provider，黑盒验证 Workspace、Member、Diagram、Relationship、错误、media type 与 SSE。
- PostgreSQL CI 先运行 `prisma migrate deploy`，再运行 migration/contract gates。
- Web client 由 OpenAPI 生成；类型检查不能替代运行时 contract test。
- Electron package smoke 验证内嵌 Pi SDK、packaged renderer、本地 Nest readiness 和 SQLite registry。

## 执行原则

- 先运行最小聚焦测试，再运行工序声明的完整质量门禁。
- Red 必须因为预期业务行为尚未实现而失败，不接受依赖、配置、timeout 或进程启动错误伪装成 Red。
- Story iteration 使用受控执行工具记录命令、退出码和工作树哈希。
- Showcase 必须重新执行已选 Q2，并由人类把实际产品观察映射回确认的 Given/When/Then、业务数据和价值反馈；命令全绿不等于价值已验证。
- PostgreSQL、跨进程 Pi 或平台 package gate 无法运行时必须明确风险，不能用 fake 结果冒充真实边界证明。
- 质量命令由 `engineering/evidence-orchestrator/test-processes/*.json` 管理；当前产品工序只选择 TypeScript Web、Nest 或 Electron 路线。
- 历史 iteration 和兼容性 fixture 可以保留旧 runtime 字段，但不得作为新 Story 的 owning process。
