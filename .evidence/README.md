# Evidence 项目领域模型

此目录是 Evidence 平台自身的权威领域模型，而不是某个用户业务的示例数据。

- `model.json`：模型元数据。
- `entities/*.yaml`：具有稳定 `id` 的领域概念。
- `associations/*.yaml`：引用实体 `source` 与 `target` 的领域关系。

`artifacts/02-domain-model/` 仅记录每轮 DDD 的模型快照、增量、场景展开、战术设计和验证报告。采购履约示例位于 `examples/laptop-procurement/.evidence/`。
