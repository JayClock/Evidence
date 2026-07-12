# 领域模型工件说明

从 workflow v4 的模型先行迭代开始，`.evidence/` 是 Evidence 项目的权威领域模型。

本目录不再维护第二套完整领域模型；每轮仅写入：

- `model-snapshot.json`：本轮使用的 `.evidence/` 文件快照和 Git 基线；
- `model-delta.json`：本轮对模型的实际新增、修改、删除及原因；
- `model-expansions/`：验收场景如何由模型解释；
- `tactical-design.md`：聚合、值对象、事件和事务边界等战术设计；
- `validation-report.md`：模型检查结果。

现有 `aggregates.md`、`bounded-contexts.md`、`domain-events.md`、`entities-and-value-objects.md` 和 `ubiquitous-language.md` 是 workflow v3 的第 0 轮历史审计工件，不再作为后续迭代的模型事实源。
