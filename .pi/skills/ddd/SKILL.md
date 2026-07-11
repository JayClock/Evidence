---
name: ddd
description: 'Apply Domain-Driven Design for strategic and tactical modeling: ubiquitous language, bounded contexts, context maps, aggregates, entities, value objects, domain events, APIs, and architecture.'
---

# DDD Skill

Use this skill in `domain_model` and `architecture` phases.

## Domain Modeling Outputs

- `artifacts/02-domain-model/ubiquitous-language.md`
- `artifacts/02-domain-model/bounded-contexts.md`
- `artifacts/02-domain-model/entities-and-value-objects.md`
- `artifacts/02-domain-model/aggregates.md`
- `artifacts/02-domain-model/domain-events.md`

## Architecture Outputs

- `artifacts/03-architecture/context-map.md`
- `artifacts/03-architecture/architecture-style.md`
- `artifacts/03-architecture/tech-stack.md`
- `artifacts/03-architecture/module-structure.md`
- `artifacts/03-architecture/api-contracts.md`
- `artifacts/03-architecture/data-model.md`

## Rules

- Prefer bounded-context boundaries over technical layering when naming modules.
- Keep API contracts explicit enough to drive implementation.
- Include Mermaid diagrams when they clarify relationships.
- Do not invent implementation details that contradict existing artifacts.

## Embedded Methodology

# Domain-Driven Design（领域驱动设计）

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

### Repository

- 提供聚合的持久化存取
- 每个聚合一个 Repository

### Domain Service

- 领域行为，不天然属于某个实体/值对象
- 无状态

### Application Service

- 用例的编排者
- 协调 Domain Service、Repository 等基础设施

### Factory

- 封装复杂对象的创建逻辑
