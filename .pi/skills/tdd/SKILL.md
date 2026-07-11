---
name: tdd
description: 'Implement Evidence monorepo user stories with real test-first development in apps/ and libs/. Use for Red-Green-Refactor loops that modify runnable code, not only markdown artifacts.'
---

# TDD Implementation Skill

Use this skill in the `coding` phase.

## Workflow

1. Select the next unimplemented `US-xxx` from `artifacts/04-planning/sprint-1-backlog.md`.
2. Read API contracts and DoD:
   - `artifacts/03-architecture/api-contracts.md`
   - `artifacts/04-planning/definition-of-done.md`
3. Identify the owning project before editing: React/Nx, Nest/Nx, Rust Axum, or Tauri.
4. Red: create or update a colocated test in that project's existing test layout and run it to confirm the expected failure.
5. Green: create or update the minimum implementation under `apps/` or `libs/` and rerun the focused test.
6. Refactor: improve structure while preserving behavior, then rerun the focused quality gates.
7. Write the story ID, changed paths, Red/Green/Refactor evidence, and command results to `artifacts/05-code/`.

## Rules

- Do not stop at Markdown pseudo-code and do not create root-level `src/` or `tests/` directories.
- Preserve the existing Evidence boundaries and follow `AGENTS.md`.
- Frontend code belongs in `apps/web` or `libs/web/*`; use the owning Nx project's test, lint, and typecheck targets.
- Rust server code belongs in `apps/server` or `libs/server/*`; run focused Cargo tests, Clippy, and rustfmt.
- Nest code belongs in `apps/server-nest` or `libs/server-nest/*`; use its Nx targets and Prisma generation when required.
- Desktop-only code belongs in `apps/desktop/src-tauri`; shared UI remains in the web surface.
- Keep tests deterministic and focused on behavior.

## Embedded Methodology

# Test-Driven Development（测试驱动开发）

## 概述

TDD 是一种以**测试为先导**的开发方法论，通过"红-绿-重构"循环确保代码质量和设计清晰。

## 核心循环

### 红（Red）

1. 先编写一个失败的测试
2. 测试描述期望的行为
3. 运行测试，确认失败（红）

### 绿（Green）

1. 编写**刚好**能通过测试的代码
2. 不做多余的设计和优化
3. 运行测试，确认通过（绿）

### 重构（Refactor）

1. 在测试保护下重构代码
2. 消除重复、改善设计
3. 运行测试，确认仍然通过

## 原则

### FIRST 原则

- **F**ast：测试应快速执行
- **I**ndependent：测试相互独立
- **R**epeatable：测试可重复执行
- **S**elf-validating：测试自断言
- **T**imely：测试及时编写

### 三重法则

1. 不写生产代码，除非有失败的测试
2. 不写超过一个失败的测试所需的测试代码
3. 不写超过一个测试通过所需的生产代码

### 测试金字塔

- 单元测试（多）：快速，覆盖单一模块
- 集成测试（中）：验证模块间协作
- E2E 测试（少）：验证完整用户场景

## 在元工程中的应用

元工程中的 TDD 由 LLM 自动执行，但遵循同样的循环：

```
LLM 编写测试 ──→ 运行测试（失败） ──→ LLM 编写实现 ──→ 运行测试（通过）
                                                          │
                                                    ┌─────┘
                                                    ▼
                                          LLM 重构代码 ──→ 运行测试（仍通过）
```

## Evidence Quality Commands

Choose the smallest applicable set first, then run broader gates before review:

```sh
pnpm nx test <project> --run
pnpm nx lint <project>
pnpm nx typecheck <project>
cargo test -p evidence-server
cargo clippy -p evidence-server --all-targets -- -D warnings
cargo fmt -p evidence-server -- --check
cargo test -p evidence-desktop
```

The generic examples below explain TDD mechanics only. They do not override the Evidence monorepo layout.

## Embedded Scaffolding

The coding phase uses the following embedded scaffolding references. There is no separate the former scaffold directory source directory.

### Project Scaffold

# Project Scaffold

此目录是从脚手架生成的目标项目骨架。LLM 在编码阶段以这里的目录结构和配置作为参考。

## 推荐的目录结构

```
project/
├── src/
│   ├── application/          # Application Service (用例编排)
│   │   └── __init__.py
│   ├── domain/               # 领域层（实体、值对象、聚合）
│   │   ├── __init__.py
│   │   ├── entities.py
│   │   ├── value_objects.py
│   │   ├── aggregates.py
│   │   └── events.py
│   ├── infrastructure/       # 基础设施（DB、消息、外部 API）
│   │   ├── __init__.py
│   │   ├── repository.py
│   │   └── database.py
│   └── interfaces/           # 接口层（REST、CLI）
│       ├── __init__.py
│       └── api.py
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── pyproject.toml
├── requirements.txt
└── Dockerfile
```

## 规则

- 保持 DDD 分层：领域层不依赖基础设施层
- Repository 接口定义在领域层，实现在基础设施层
- Application Service 做编排，Domain Service 做业务逻辑

### Code Template: Repository

# Repository 模板

DDD 中 Repository 的代码模板，供 LLM 在编码阶段参考。

## 接口（领域层）

```python
from abc import ABC, abstractmethod
from typing import Optional, List
from domain.aggregates import AggregateRoot

class Repository(ABC):
    """Repository 接口定义在领域层"""

    @abstractmethod
    def save(self, aggregate: AggregateRoot) -> None: ...

    @abstractmethod
    def find_by_id(self, id: str) -> Optional[AggregateRoot]: ...

    @abstractmethod
    def delete(self, id: str) -> None: ...

    @abstractmethod
    def find_all(self) -> List[AggregateRoot]: ...
```

## 实现（基础设施层）

```python
from infrastructure.database import db
from domain.aggregates import AggregateRoot

class SqlRepository(Repository):
    """具体实现在基础设施层"""

    def save(self, aggregate: AggregateRoot) -> None:
        db.session.save(aggregate)

    def find_by_id(self, id: str) -> Optional[AggregateRoot]:
        return db.session.query(AggregateRoot).get(id)

    # ...
```

### Test Template: Unit Tests

# 单元测试模板

TDD 中 LLM 生成测试的参考模板。

## 测试文件模板

```python
import pytest
from domain.entities import Entity
from domain.value_objects import ValueObject
from domain.aggregates import AggregateRoot

class TestEntityName:
    """实体名称 的单元测试"""

    def test_create_valid_entity(self):
        """创建有效实体"""
        entity = Entity(id="1", name="test", value=42)
        assert entity.id == "1"
        assert entity.name == "test"

    def test_entity_invariant_enforced(self):
        """业务不变式检查"""
        with pytest.raises(ValueError):
            Entity(id="1", name="", value=42)

    def test_value_object_immutability(self):
        """值对象不可变性"""
        vo = ValueObject(x=1, y=2)
        with pytest.raises(AttributeError):
            vo.x = 3

    def test_aggregate_root_identity(self):
        """聚合根通过 ID 而非属性区分"""
        agg1 = AggregateRoot(id="1")
        agg2 = AggregateRoot(id="2")
        assert agg1 != agg2
```

## 测试数据模板

```python
@pytest.fixture
def valid_entity():
    return Entity(id="1", name="test", value=42)

@pytest.fixture
def aggregate_with_items():
    agg = AggregateRoot(id="1")
    agg.add_item("item-1")
    agg.add_item("item-2")
    return agg
```
