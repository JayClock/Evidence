# Evidence 产品业务上下文

本文件描述 Evidence 建模平台的长期产品业务知识。候选知识只有经过用户场景验证和产品负责人确认后，才能提升到这里；具体研发工作流不属于本产品上下文。

## 产品目的

Evidence 帮助领域专家和业务分析师收集可追溯来源、定义业务概念，将证据、参与者、角色和上下文组织成可审计、可演进的关系模型，并用图支持理解和评审。

## 核心业务能力

1. **工作空间协作**：用户通过成员关系进入隔离的建模空间。
2. **来源收集**：用户在 Workspace Inbox 捕获手工或 provider 来源，并查看不可变 Revision 历史。
3. **逻辑模型编写**：在工作区定义 LogicalEntity 与 LogicalRelationship。
4. **图投影**：Diagram、DiagramNode 和 DiagramEdge 将逻辑模型投影为可视关系图；图元素不是逻辑实体本身。
5. **模型辅助**：AI Modeling Agent 可以提出 ModelingProposal，但提案经用户确认后才能改变模型。
6. **一致体验**：Web 是唯一前端产品；Desktop 通过 Electron 包装同一前端并消费相同 REST/HAL 语义。

## 核心规则

- Workspace 是成员、Inbox、逻辑模型和图的协作边界。
- 同一 source identity 的重复捕获是幂等的；每个不同 SHA-256 source snapshot 只保留一个不可变 Revision。
- Desktop repository 路径只保存在 Desktop binding store，不进入 Server Workspace metadata。
- LogicalEntity 可独立于 Diagram 存在；DiagramNode 只能引用逻辑实体。
- LogicalRelationship 的 source/target 必须引用工作区内存在的逻辑实体。
- DiagramEdge 可以表示一个 LogicalRelationship，但图边与逻辑关系生命周期不同。
- AI 只能提出建模建议，不能绕过确认直接修改权威模型。
- Web 与 Desktop 不得形成两套产品语义。

## 产品知识变更规则

- 候选 Feature 必须先明确产品用户、问题、价值与可观察场景。
- 只有经过场景验证和产品负责人确认的稳定知识才能合并到本文件。
- 技术实现、API、数据库、测试框架以及 Evidence Orchestrator 的内部交付流程不属于本产品业务价值，应放入架构或工程知识。
