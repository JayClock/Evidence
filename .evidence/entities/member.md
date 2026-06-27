---
id: member
name: Member
label: 工作空间成员
type: PARTICIPANT
subType: Thing
---

# Member｜工作空间成员

> Member 不是独立用户，而是 User 在 Workspace 中的角色投影。

## 基本信息

| 项目     | 值                                 |
| -------- | ---------------------------------- |
| 模型类型 | Entity                             |
| 领域类型 | Role / Party                       |
| 主标识   | `id`                               |
| 主要职责 | 连接 User 与 Workspace，并保存角色 |

## 属性

| 属性        | 类型             | 必填 | 说明                       |
| ----------- | ---------------- | ---- | -------------------------- |
| `id`        | `string`         | 是   | 成员 ID                    |
| `workspace` | `Ref<Workspace>` | 是   | 所属工作空间               |
| `user`      | `Ref<User>`      | 是   | 对应用户                   |
| `role`      | `string`         | 是   | 成员角色，如 owner、member |
| `createdAt` | `datetime`       | 是   | 创建时间                   |
| `updatedAt` | `datetime`       | 是   | 更新时间                   |

## 行为

| 操作                    | 说明                   |
| ----------------------- | ---------------------- |
| `add_member(desc)`      | 添加工作空间成员       |
| `remove_member(userId)` | 移除指定用户的成员身份 |

## 业务规则

- 同一个 Workspace 中，同一个 User 只能有一个 Member。
- Workspace 创建时默认添加 owner 成员。
