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

## 兼容性基线

`libs/contracts/api-contracts/baseline/` 保存 `server-compatibility-v1`：

- `compatibility-v1.json` 固定 OpenAPI source、既有 Flyway migration chain，以及迁移后 PostgreSQL 的逐表 columns、constraints、indexes 摘要；migration 只能追加。
- `hal-goldens.json` 固定认证失败、HAL resource/collection、分页、领域错误和 `204` 的代表性 wire response。
- `hash-vectors.json` 固定 canonical JSON 和 Candidate、Intake、Kickoff 权威内容 hash。
- `database-catalog.sql` 是语言无关的 PostgreSQL catalog 投影，并忽略 migration bookkeeping table。

静态基线运行 `pnpm compatibility:check`。运行时 HAL 与 database catalog 基线包含在 `pnpm api:contracts` 中。协议、schema 或 hash 语义有意变化时，必须先审查兼容性影响，再显式发布下一版基线。

## 执行原则

- 先运行最小聚焦测试，再运行工序声明的完整质量门禁。
- Red 必须因预期业务行为缺失而失败，不接受依赖、配置、timeout 或进程启动错误伪装成 Red。
- Story iteration 使用受控执行工具记录命令、退出码和工作树哈希。
- Showcase 必须重新执行已选 Q2；命令全绿不等于价值已验证。
- PostgreSQL、Desktop Pi 或平台 package gate 无法运行时必须明确风险，不能用 fake 冒充真实边界。
