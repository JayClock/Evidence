# Evidence 核心用户旅程

本文件只维护跨 Feature 稳定的核心旅程。每次迭代在 `journey-slice.md` 描述本轮触及的步骤、异常和反馈。

## 旅程 A：建立业务模型

1. 用户进入或创建工作区。
2. 用户邀请成员或确认协作边界。
3. 用户定义 Evidence、Participant、Role、Context 等逻辑实体。
4. 用户定义逻辑关系及其方向和含义。
5. 用户创建 Diagram，把逻辑实体投影为节点并展示关系。
6. 团队浏览、讨论并修正模型。
7. 经确认的模型变化被持久化并保留可追踪关系。

## 旅程 B：借助 AI 改进模型

1. 用户在具体工作区和图上下文中描述建模意图。
2. Agent 读取当前模型与上下文。
3. Agent 返回可解释的 ModelingProposal。
4. 用户检查新增、修改、删除及其影响。
5. 用户接受或拒绝提案。
6. 只有接受的提案改变权威模型，结果重新投影到图。

## 旅程 C：从产品想法交付 Evidence 增量

1. 产品人员以 GitHub Issue 定义问题。
2. 团队通过 TQA 澄清隐性业务知识。
3. 用 Given/When/Then 示例定义可观察价值。
4. 用 `.evidence` 模型展开场景并识别模型增量。
5. 从统一架构、测试策略和工序目录选择垂直切片。
6. 对单个场景执行可观测的 Red/Green/Refactor。
7. 评审产品价值和质量，沉淀 Probe/Sense/Respond 学习。
8. 将稳定知识提升到统一知识源，把下一问题更新到 Issue。

## 旅程 D：跨 Web/Desktop 使用

1. Web 用户通过浏览器访问共享前端。
2. Desktop 用户通过 Tauri WebView 使用同一前端。
3. 两者消费一致的 REST/domain 语义。
4. Desktop 特有能力通过 Tauri command/capability 提供，不复制业务页面。
