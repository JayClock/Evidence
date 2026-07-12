# Evidence 测试替身策略

| 替身 | 使用条件                             | Evidence 典型用途                               |
| ---- | ------------------------------------ | ----------------------------------------------- |
| Real | 真实对象快速、确定且能提高信心       | Domain value/entity、React composition、最终 Q2 |
| Fake | 需要保持有意义行为但替代昂贵基础设施 | Fake store、内存 repository、数据库契约支撑     |
| Stub | 下游只需返回固定结果                 | API/domain port、Tauri adapter 响应             |
| Spy  | 需要验证重要协作是否发生             | 提案应用、导航或外部 port 调用                  |
| Mock | 交互协议本身就是行为且断言价值高     | HTTP transport 或严格边界；避免过度 mock        |

## 选择规则

1. 优先真实、快速、确定的对象。
2. 用 Fake 表达可复用业务行为，并通过契约测试防止与生产实现漂移。
3. Stub 只提供当前场景需要的数据，不复制被替代对象的全部逻辑。
4. 不因实现细节使用 Mock；测试应描述可观察行为。
5. 测试替身不能跨越多个功能上下文而隐藏真正的集成风险。
6. `scenario-context-map.json` 必须为每个 runtime 记录所选替身；实际工序证据必须一致。

## 关键契约

- Rust fake store 与 PostgreSQL adapter 共享领域契约测试。
- Nest memory/Prisma adapter 应共享等价 repository 行为测试。
- Web API client 可以替换 transport，但资源语义和渲染场景应保持真实。
- 最终 Q2 是否使用真实跨进程系统由场景风险决定，不机械追求端到端覆盖。
