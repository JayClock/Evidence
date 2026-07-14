# Evidence 测试策略

本文件定义跨 Feature 共享的质量反馈结构。场景只负责选择功能上下文和工序，不重新设计整套测试策略。

## 测试四象限

- **Q1：技术导向、支持团队**——领域、组件、资源 adapter、持久化契约等快速定位测试。
- **Q2：业务导向、支持团队**——从 Given/When/Then 验收示例派生的场景测试。
- **Q3：业务导向、评价产品**——探索性、可用性、可访问性和兼容性评价。
- **Q4：技术导向、评价产品**——性能、安全、可靠性和可运维性评价。
- Q3/Q4 按风险补充但不替代 Q1/Q2；每个 Scenario 都必须显式记录 `not_required`（含理由）或 `required`（含具体评价活动），不要求无风险场景机械执行全部象限。

## 追踪规则

每个计划场景必须形成：

```text
SC-xxx → Q2 tests → owning runtime/functional contexts
       → Q1 tests → test doubles → test processes → quality gates
```

Q2 失败时，应至少有一个更细粒度 Q1 测试帮助定位；低价值的薄协议层可以与相邻上下文合并测试，但必须在场景映射中明确。

## Runtime 策略

| Runtime | 主要 Q1                                      | 主要 Q2                            |
| ------- | -------------------------------------------- | ---------------------------------- |
| Web     | component/hook/resource tests                | rendered route/feature scenario    |
| Rust    | domain tests、fake/PostgreSQL contract tests | Axum HTTP acceptance test          |
| Nest    | domain/repository tests                      | Nest controller/module scenario    |
| Tauri   | command/adapter tests                        | desktop shell integration scenario |

## 执行原则

- 先运行最小聚焦测试，再运行工序声明的完整质量门禁。
- Red 必须因为预期业务行为尚未实现而失败，不接受依赖或配置错误伪装成 Red。
- Issue 驱动 iteration 使用受控执行工具记录退出码和工作树哈希。
- Showcase 必须重新执行已选 Q2，并把实际结果映射回确认的 Given/When/Then；命令全绿本身不等于用户价值已经验证。
- 独立 Reviewer 只读区分 observed facts、product/domain feedback、technical quality feedback 与 unresolved assumptions；只有人类 accept 才能进入 Respond。
- PostgreSQL 契约测试在环境可用时运行；无法运行必须明确风险，不能把 fake 结果等同于生产数据库证明。
- 质量命令由 `engineering/evidence-orchestrator/test-processes/*.json` 管理。
