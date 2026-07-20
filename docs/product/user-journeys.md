# Evidence 核心用户旅程

本文件只维护 Evidence 建模平台用户跨 Feature 的稳定核心旅程。仓库开发、测试与发布流程属于内部工程旅程，不进入这里。

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

## 旅程 C：跨 Web/Desktop 使用

1. Web 用户通过浏览器访问共享前端和 Hosted API。
2. Desktop 用户通过 Electron renderer 使用同一前端。
3. Electron 默认启动本地 API 与本地存储，也可显式连接远程 API。
4. 两者消费一致的 REST/HAL 与领域语义。
5. Desktop 特有能力通过受限 preload bridge 提供，不复制业务页面或业务 API。
