# Evidence 测试替身策略

| 替身 | 使用条件                             | Evidence 典型用途                                                    |
| ---- | ------------------------------------ | -------------------------------------------------------------------- |
| Real | 真实对象快速、确定且能提高信心       | Domain value/entity、React composition、filesystem temp dir、最终 Q2 |
| Fake | 需要保持有意义行为但替代昂贵基础设施 | memory repository、fake remote API、Git command runner               |
| Stub | 下游只需返回固定结果                 | domain port、Electron renderer/child 响应                            |
| Spy  | 需要验证重要协作是否发生             | Agent 取消、Pair command observation、导航或外部 port 调用           |
| Mock | 交互协议本身就是行为且断言价值高     | Prisma client、HTTP transport 或严格边界；避免过度 mock              |

## 选择规则

1. 优先真实、快速、确定的对象。
2. 用 Fake 表达可复用业务行为，并通过等价行为测试防止与生产 adapter 漂移。
3. Stub 只提供当前场景需要的数据，不复制被替代对象的全部逻辑。
4. 不因实现细节使用 Mock；测试应描述可观察行为。
5. 测试替身不能跨越多个功能上下文而隐藏真正的集成风险。
6. `scenario-context-map.json` 必须为每个 runtime 记录所选替身；实际工序证据必须一致。

## 关键契约

- Nest domain/memory 与 Prisma/PostgreSQL adapter 共享可观察 repository 语义。
- `.evidence` adapter 使用真实临时目录验证 YAML、路径安全、端点和投影行为。
- API controller tests 可以替换 domain ports，但本地 black-box runner 必须经过真实 Nest HTTP stack。
- Desktop Agent 的快速测试注入受控 Pi session/event source，并在临时 worktree 中验证路径限制、事件顺序、完成/错误和取消语义；Server contract 不启动 Pi。
- Electron lifecycle tests 可以 fake renderer/API；发布边界必须通过真实 unpacked package smoke。
- Web API client 可以替换 transport，但 HAL 资源语义和渲染场景应保持真实。
- 最终 Q2 是否使用真实 PostgreSQL、Desktop Pi provider 或平台安装包由场景风险决定，不机械追求端到端覆盖。
