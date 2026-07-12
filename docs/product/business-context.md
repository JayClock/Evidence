# Evidence 产品业务上下文

本文件描述 Evidence 的长期整体解决方案，是跨迭代统一维护的业务知识。迭代中的 TQA 新知识先进入 `product-context-delta.md`，经 Learn/Gate 审核后再提升到这里。

## 产品目的

Evidence 帮助领域专家、分析师和交付团队定义业务概念，将证据、参与者、角色和上下文组织成可审计、可演进的关系模型，并用图支持理解和评审。

## 核心业务能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **逻辑模型编写**：在工作区定义 LogicalEntity 与 LogicalRelationship。
3. **图投影**：Diagram、DiagramNode 和 DiagramEdge 将逻辑模型投影为可视关系图；图元素不是逻辑实体本身。
4. **模型辅助**：AI Modeling Agent 可以提出 ModelingProposal，但提案经用户确认后才能改变模型。
5. **一致体验**：Web 是唯一前端产品；Desktop 通过 Tauri 包装同一前端。
6. **可审计交付**：GitHub Issue、场景、模型展开、测试工序、代码证据和学习反馈形成追踪链。

## 核心规则

- Workspace 是成员、逻辑模型和图的协作边界。
- LogicalEntity 可独立于 Diagram 存在；DiagramNode 只能引用逻辑实体。
- LogicalRelationship 的 source/target 必须引用工作区内存在的逻辑实体。
- DiagramEdge 可以表示一个 LogicalRelationship，但图边与逻辑关系生命周期不同。
- AI 只能提出建模建议，不能绕过确认直接修改权威模型。
- Web 与 Desktop 不得形成两套产品语义。

## 产品知识变更规则

- 新 Feature 先在 iteration 中记录问题和上下文增量。
- 只有经过场景验证与人工 Gate 的稳定知识才能合并到本文件。
- 技术实现、API、数据库和测试框架不属于业务价值，应放入架构知识。
