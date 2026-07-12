# 产品待办列表

本文基于 Evidence 当前需求、DDD 领域模型和架构工件，将后续交付拆分为可执行的产品待办。优先级以当前项目价值、架构风险和可验证性排序。

## 优先级说明

| 优先级 | 含义                                     |
| ------ | ---------------------------------------- |
| P0     | MVP 必须完成，阻塞核心闭环或质量门。     |
| P1     | Release 1 重要能力，提升可用性和一致性。 |
| P2     | 后续增强能力，不阻塞第一轮核心验证。     |

## Epic 总览

| Epic ID  | Epic                     | 目标                                                             | 优先级 |
| -------- | ------------------------ | ---------------------------------------------------------------- | ------ |
| EPIC-001 | 工作区入口与默认体验     | 用户能通过默认用户进入默认工作区并浏览工作区。                   | P0     |
| EPIC-002 | 逻辑实体建模闭环         | 用户能创建、查看、更新和删除 Evidence/Participant/Role/Context。 | P0     |
| EPIC-003 | 图建模闭环               | 用户能创建图、添加节点、连接边并读取完整图。                     | P0     |
| EPIC-004 | Web/Desktop 一致体验     | Web 与 Desktop 共享前端、API 和本地开发命令。                    | P1     |
| EPIC-005 | API 契约与生成客户端     | OpenAPI 与前端 API 类型保持一致。                                | P1     |
| EPIC-006 | 持久化契约质量门         | fake store 与 PostgreSQL 对核心行为保持一致。                    | P0     |
| EPIC-007 | Evidence Workflow 工件流 | 需求、领域、架构、计划、编码、评审具备可审计记录。               | P1     |

## Product Backlog Items

| PBI ID  | Epic     | 用户故事                                                                     | 优先级 | 估算 | 验收标准                                                                |
| ------- | -------- | ---------------------------------------------------------------------------- | ------ | ---- | ----------------------------------------------------------------------- |
| PBI-001 | EPIC-001 | 作为用户，我希望通过 `/api` 获取 default-user 链接，以便快速进入 Evidence。  | P0     | 2    | `GET /api` 返回 health、self、default-user；默认用户路径可访问。        |
| PBI-002 | EPIC-001 | 作为用户，我希望默认用户能看到默认工作区，以便无需配置即可开始建模。         | P0     | 3    | `desktop-user` 可列出 `default-workspace`；fake/Postgres 契约测试覆盖。 |
| PBI-003 | EPIC-001 | 作为用户，我希望创建新工作区，以便隔离不同业务领域模型。                     | P0     | 5    | 创建工作区后自动创建 owner member；重复或非法输入返回稳定错误。         |
| PBI-004 | EPIC-002 | 作为领域建模负责人，我希望创建逻辑实体，以便记录业务概念。                   | P0     | 5    | 支持 Evidence、Participant、Role、Context；子类型校验；返回 HAL links。 |
| PBI-005 | EPIC-002 | 作为业务分析师，我希望查看工作区逻辑实体列表，以便理解模型范围。             | P0     | 3    | 列表支持 page/pageSize；返回 `_embedded` 与 `page`。                    |
| PBI-006 | EPIC-002 | 作为业务分析师，我希望更新逻辑实体定义、属性、行为和标签，以便持续修正模型。 | P0     | 5    | 更新后读取一致；NotFound/Validation 行为稳定。                          |
| PBI-007 | EPIC-002 | 作为领域建模负责人，我希望删除逻辑实体，以便保持模型干净。                   | P1     | 3    | soft delete 后列表不可见；关联节点策略被明确并测试。                    |
| PBI-008 | EPIC-003 | 作为用户，我希望创建图，以便围绕业务问题组织关系。                           | P0     | 3    | 图属于工作区；返回 self、collection、nodes、edges links。               |
| PBI-009 | EPIC-003 | 作为用户，我希望添加引用逻辑实体的图节点，以便可视化业务概念。               | P0     | 5    | 节点位置/样式可保存；逻辑实体引用跨工作区时被拒绝。                     |
| PBI-010 | EPIC-003 | 作为用户，我希望连接两个节点形成图边，以便表达关系。                         | P0     | 5    | source/target 必须存在且属于同一图；悬空边被拒绝。                      |
| PBI-011 | EPIC-003 | 作为用户，我希望读取图详情时获得节点和边，以便一次性渲染完整图。             | P0     | 3    | `GET /diagrams/{did}` 内嵌 nodes 和 edges。                             |
| PBI-012 | EPIC-004 | 作为桌面用户，我希望 Tauri 加载同一套 Web 前端，以便体验一致。               | P1     | 3    | dev 加载 `127.0.0.1:4200`；build 使用 `apps/web/dist`。                 |
| PBI-013 | EPIC-004 | 作为开发者，我希望本地命令清晰，以便快速启动 Web、Server、Desktop。          | P1     | 2    | README 保留并验证 `pnpm dev:web/server/desktop`。                       |
| PBI-014 | EPIC-005 | 作为前端开发者，我希望从 OpenAPI 生成 API 类型，以便减少接口漂移。           | P1     | 3    | `pnpm api:generate` 可生成 schema；生成文件与 API 匹配。                |
| PBI-015 | EPIC-005 | 作为维护者，我希望 API 契约检查进入质量门，以便 PR 前发现漂移。              | P1     | 3    | `pnpm api:contracts` 在本地或 CI 可运行。                               |
| PBI-016 | EPIC-006 | 作为开发者，我希望 fake store 和 PostgreSQL 共享 workspace 契约测试。        | P0     | 5    | seed workspace、owner member、duplicate member contract 均覆盖。        |
| PBI-017 | EPIC-006 | 作为开发者，我希望 logical entity CRUD 有契约测试。                          | P0     | 5    | fake/Postgres CRUD 行为一致。                                           |
| PBI-018 | EPIC-006 | 作为开发者，我希望 diagram node/edge 引用校验有契约测试。                    | P1     | 8    | 无效 logical entity、无效 source/target、跨图边均失败。                 |
| PBI-019 | EPIC-007 | 作为团队成员，我希望 Evidence Workflow 记录阶段工件，以便追踪决策。          | P1     | 3    | `artifacts/` 包含阶段输出；gate 可记录人类审核。                        |
| PBI-020 | EPIC-007 | 作为维护者，我希望 workflow 命令使用 Evidence 前缀，以便与当前项目语义一致。 | P1     | 2    | `/evidence-status/run/gate/reset` 和 `evidence_workflow_*` 工具可用。   |

## Release 1 推荐范围

Release 1 聚焦从工作区到逻辑实体再到图的最小可用闭环：

- PBI-001 到 PBI-006
- PBI-008 到 PBI-011
- PBI-016 到 PBI-017
- PBI-020

## 暂缓项

| PBI             | 暂缓原因                                           |
| --------------- | -------------------------------------------------- |
| PBI-007         | 删除逻辑实体后的节点引用策略需先在架构评审中确认。 |
| PBI-014/PBI-015 | 可在 API 稳定后纳入 CI。                           |
| PBI-018         | 图建模基础闭环完成后再补强边界测试。               |
