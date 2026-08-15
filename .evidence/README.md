# Evidence 项目领域模型

此目录是 Evidence 建模平台自身的权威产品领域模型，而不是某个用户业务的示例数据。

- `model.json`：模型元数据。
- `entities/*.yaml`：具有稳定 `id` 的领域概念。
- `associations/*.yaml`：引用实体 `source` 与 `target` 的领域关系。
- `scenarios/*.json`：经领域专家确认、用于检测候选模型退化的稳定回归或 holdout 场景；它们引用模型 ID，但不复制模型定义。

采购履约参考模型位于 `examples/laptop-procurement/.evidence/`。
