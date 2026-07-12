---
name: ddd
description: '应用领域驱动设计（DDD）进行战略与战术建模：统一语言、限界上下文、上下文映射、聚合、实体、值对象、领域事件、API 与架构。'
---

# 领域驱动设计（DDD）技能

在 `domain_model` 与 `architecture` 阶段使用本技能。

## 领域建模输出

权威领域模型：

- `.evidence/model.json`
- `.evidence/entities/*.yaml`
- `.evidence/associations/*.yaml`

本轮建模证据：

- `artifacts/02-domain-model/model-snapshot.json`
- `artifacts/02-domain-model/model-delta.json`
- `artifacts/02-domain-model/model-expansions/US-xxx-SC-xxx.json`
- `artifacts/02-domain-model/tactical-design.md`
- `artifacts/02-domain-model/validation-report.md`

## 架构输出

- `artifacts/03-architecture/context-map.md`
- `artifacts/03-architecture/architecture-style.md`
- `artifacts/03-architecture/tech-stack.md`
- `artifacts/03-architecture/module-structure.md`
- `artifacts/03-architecture/api-contracts.md`
- `artifacts/03-architecture/data-model.md`
- `artifacts/03-architecture/functional-contexts.md`
- `artifacts/03-architecture/test-strategy.md`
- `artifacts/03-architecture/test-doubles.md`
- `artifacts/03-architecture/test-processes/*.md`

## 规则

- 命名模块时，优先体现限界上下文边界，而非技术分层。
- API 契约必须足够明确，能够直接指导实现。
- `.evidence/` 是当前项目的权威领域模型，同时是本阶段输入和输出。先用现有模型展开场景；仅在概念缺失、关系错置或生命周期错误时演进模型。
- `.evidence/model.json` 声明模型所属项目和用途；实体和关联必须使用稳定 frontmatter `id`，关联的 `source` 与 `target` 必须引用已有实体。
- `artifacts/02-domain-model/` 不得复制另一套完整领域模型。`model-snapshot.json` 记录 Git baseline 和完整模型文件清单，`model-delta.json` 记录与 Git 实际变化一致的 added/changed/removed 及原因。
- 不得编造与既有模型及工件冲突的实现细节。
- 使用“就绪”的 Given/When/Then 示例验证模型。每份 `US-xxx-SC-xxx.json` 通过 `model_refs.entities` 和 `model_refs.associations` 引用 `.evidence` 稳定 ID，并说明 Given 实体/关系、When 命令、Then 创建/变更/删除的实体和关系、不变量与时间线；在 `validation-report.md` 中记录概念缺失和关系错置。
- 聚合、值对象、领域事件和事务边界等战术 DDD 决策写入 `tactical-design.md`；它们是模型应用决策，不是第二套问题域模型。
- 架构必须把每个已计划场景从 Q2 验收测试映射到功能上下文、Q1 支撑测试和选定测试替身。测试工序是有顺序、可复用且测试先行的工作指令，不是泛化任务清单。

## 内嵌方法论

# 领域驱动设计（Domain-Driven Design）

## 概述

DDD 是一种以**领域**为核心的软件建模方法，强调通过统一语言与业务专家对齐，将业务复杂度控制在领域模型中。

## 战略设计

### 统一语言（Ubiquitous Language）

- 团队内共享的术语表，确保代码、文档、对话中使用同一语言
- 每个术语必须有明确、无歧义的定义

### 限界上下文（Bounded Context）

- 每个上下文是语义边界的显式划分
- 不同上下文中的同一术语可能有不同含义
- 上下文之间通过上下文映射（Context Map）定义关系

### 实体（Entity）

- 有唯一标识，生命周期内可变化
- 通过 ID 而非属性值来区分

### 值对象（Value Object）

- 无唯一标识，由属性值定义
- 不可变，可替换
- 例如：金额（Amount）、地址（Address）

### 聚合（Aggregate）

- 一组相关对象的集群，保证数据一致性
- 聚合根（Aggregate Root）是外部访问的唯一入口
- 每个事务只修改一个聚合

### 领域事件（Domain Event）

- 领域中发生的有意义的事件
- 用于跨聚合通信和业务流程建模

## 战术设计

### 仓储（Repository）

- 提供聚合的持久化存取
- 每个聚合一个 Repository

### 领域服务（Domain Service）

- 表达不天然属于某个实体或值对象的领域行为
- 无状态

### 应用服务（Application Service）

- 负责用例编排
- 协调领域服务、Repository 等基础设施

### 工厂（Factory）

- 封装复杂对象的创建逻辑
