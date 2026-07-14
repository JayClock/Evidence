# Evidence 项目领域模型

此目录是 Evidence 建模平台自身的权威产品领域模型，而不是某个用户业务的示例数据，也不是开发该平台所用 Evidence Orchestrator 的流程模型。

- `model.json`：模型元数据。
- `entities/*.yaml`：具有稳定 `id` 的领域概念。
- `associations/*.yaml`：引用实体 `source` 与 `target` 的领域关系。
- `scenarios/*.json`：经领域专家确认、用于检测候选模型退化的稳定回归或 holdout 场景；它们引用模型 ID，但不复制模型定义。

`artifacts/02-domain-model/projections/` 中的 Mermaid、Glossary 和 model context 均由权威模型、候选补丁与回归场景确定性生成，可随时重建，不是第二份模型。其他 `artifacts/02-domain-model/` 内容只记录单轮候选、展开、决策与验证证据。Orchestrator 使用本模型进行 dogfooding 只是验证开发场景，不能据此把 Kickoff、Tasking、Pair、Showcase 或 Respond 写成产品概念。

仅当人类确认的 Profile 为 `business/eight_x_flow` 时，模型元素可以使用以下方法特有元数据：Context 的 `contextKind`；履约请求的 `timeConstraint` 与 `timeoutOutcome`；跨上下文确认关系的 `crossContext` 与 `evidenceRole`。这些字段不应强加给领域系统或工具模型。具体规则由 `.pi/skills/evidence-8x-flow/SKILL.md` 和对应确定性 validator 共同维护。采购履约参考位于 `examples/laptop-procurement/.evidence/`。
