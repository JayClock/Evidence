# Evidence 产品故事地图

本文件只维护 Evidence 建模平台用户的稳定活动主干和能力地图。GitHub Issue、研发迭代和 Orchestrator 操作属于内部交付知识，不作为用户活动列入本图。

| 顺序 | 用户活动        | 稳定能力                                                              |
| ---- | --------------- | --------------------------------------------------------------------- |
| 1    | 进入协作空间    | 用户、工作区、成员和角色                                              |
| 2    | 整理来源输入    | Inbox、不可变 Revision、Desktop source adapter 与 1–5 项 Extraction   |
| 3    | 选择交付提案    | 本地 Inbox Analyst、精确 citation、ready/stale 与 defer/reject/select |
| 4    | 确认 Kickoff    | Iteration、Frozen Intake、隔离 worktree、替代 Proposal 与人工决定     |
| 5    | 澄清一张 Story  | 单问题 TQA、显式回答、Clarification history 与 Story correction 路由  |
| 6    | 确认验收场景    | 完整 Scenario Proposal、具体业务数据、人工决定与不可变 Story Revision |
| 7    | 建模与任务规划  | Modeling Profile、模型决定、TEST/TASK 与 Desk Check                   |
| 8    | 执行并审查代码  | CodingRun、隔离 worktree、质量门、本地 diff 与人工接受/拒绝           |
| 9    | 编写逻辑模型    | 逻辑实体、逻辑关系、属性、行为和定义                                  |
| 10   | 构建关系图      | 图、节点、边、布局和逻辑模型引用                                      |
| 11   | 浏览与评审      | 资源浏览、模型解释、错误反馈和变更影响                                |
| 12   | Desktop AI 建模 | 本地 Agent、受限工具、流式活动和远程模型 command                      |
| 13   | 跨运行界面使用  | Web 共享前端、Desktop repository binding 和一致 REST/HAL 语义         |

## 切片原则

- 每个用户故事表达一个产品用户要解决的问题及价值，而不是技术任务或内部交付步骤。
- 用户活动按可独立验证的产品结果切片，不按 Web、API、数据库或测试分层。
- 内部研发优先级、Sprint 和完成百分比不在本文件维护。
- 已实现产品能力的事实以产品行为、领域模型和对外契约为准。
