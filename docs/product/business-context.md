# Evidence 产品业务上下文

本文件描述 Evidence 的长期整体解决方案，是跨迭代统一维护的业务知识。迭代中发现的候选知识先作为 delta 保存，经真实场景验证和人工反馈后再提升到这里。

## 产品目的

Evidence 帮助领域专家和分析师使用 8X Flow 的 Evidence、Participant、Role 与 Context 视角定义业务概念，将它们组织成可审计、可演进的关系模型，并用图支持理解和评审。

## 建模方法边界

Evidence 当前是**有明确方法约束的 8X Flow 建模平台**，不是可任意配置概念类型的通用元模型编辑器。

- `EVIDENCE`、`PARTICIPANT`、`ROLE`、`CONTEXT` 是产品语言和领域不变量的一部分。
- 工作区、逻辑模型、图投影和 AI 提案都使用同一组语义。
- 若未来支持其他建模方法，必须先把 `modeling_method/profile` 定义为显式产品能力；不得仅在某个 UI、API 或数据库枚举中局部扩展类型。

## 核心业务能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **逻辑模型编写**：在工作区定义 LogicalEntity 与 LogicalRelationship。
3. **图投影**：Diagram、DiagramNode 和 DiagramEdge 将逻辑模型投影为可视关系图；图元素不是逻辑实体本身。
4. **模型辅助**：AI Modeling Agent 可以提出 ModelingProposal，但提案经用户确认后才能改变模型。
5. **一致体验**：Web 是唯一前端产品；Desktop 通过 Tauri 包装同一前端。

## 核心规则

- Workspace 是成员、逻辑模型和图的协作边界。
- LogicalEntity 可独立于 Diagram 存在；DiagramNode 只能引用逻辑实体。
- LogicalRelationship 的 source/target 必须引用工作区内存在的逻辑实体。
- DiagramEdge 可以表示一个 LogicalRelationship，但图边与逻辑关系生命周期不同。
- AI 只能提出建模建议，不能绕过确认直接修改权威模型。
- Web 与 Desktop 不得形成两套产品语义。

## 产品知识变更规则

- 新 Feature 先在 iteration 中记录问题和产品上下文增量。
- 只有经过示例、模型展开、可运行软件和人工反馈验证的稳定知识才能合并到本文件。
- 交付流程、技术实现、API、数据库和测试框架不属于产品业务能力，应放入工程或架构知识。
