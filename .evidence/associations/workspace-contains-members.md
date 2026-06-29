---
id: assoc_workspace_contains_members
kind: association
schemaVersion: 1
name: WorkspaceContainsMembers
label: 工作空间包含成员
source: workspace
target: member
relationshipType: contains
direction: directed
cardinality: one-to-many
summary: Workspace 包含 Member 集合。
---

# Workspace → Member｜工作空间包含成员

> 工作空间通过成员集合管理哪些用户可以访问它，以及这些用户具有什么角色。

## 关系卡片

| 项目     | 值                                    |
| -------- | ------------------------------------- |
| 源对象   | [Workspace](../entities/workspace.md) |
| 目标对象 | [Member](../entities/member.md)       |
| 关系类型 | `contains`                            |
| 方向     | Workspace → Member                    |
| 基数     | one-to-many                           |
| 只读接口 | `members()`                           |
| 写接口   | `members_wide()`                      |

## 业务规则

- 一个 Workspace 可以有多个 Member。
- 同一 Workspace 内，同一 User 不能重复添加成员身份。
- 创建 Workspace 时会自动创建 owner 成员。
