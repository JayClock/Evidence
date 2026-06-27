---
id: assoc_user_owns_workspaces
kind: association
schemaVersion: 1
name: UserOwnsWorkspaces
label: 用户访问工作空间
source: user
target: workspace
relationshipType: has_many
direction: directed
cardinality: one-to-many
summary: User 通过 UserWorkspaces 访问 Workspace 集合。
---

# User → Workspace｜用户访问工作空间

> 一个用户可以访问多个工作空间。实际授权和角色由 Member 表达。

## 关系卡片

| 项目     | 值                                    |
| -------- | ------------------------------------- |
| 源对象   | [User](../entities/user.md)           |
| 目标对象 | [Workspace](../entities/workspace.md) |
| 关系类型 | `has_many`                            |
| 方向     | User → Workspace                      |
| 基数     | one-to-many                           |
| 领域接口 | `UserWorkspaces`                      |
| API 路径 | `/api/users/{userId}/workspaces`      |

## 业务含义

User 不直接拥有 Workspace 的全部权限；它只是能通过集合入口查询可访问的 Workspace。具体角色由 [Member](../entities/member.md) 决定。

## 修改这条关系

在本地优先 Markdown 设计中，若要修改“用户如何访问工作空间”的语义，只需要修改这个关联对象文件。
