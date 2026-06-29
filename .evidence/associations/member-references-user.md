---
id: assoc_member_references_user
kind: association
schemaVersion: 1
name: MemberReferencesUser
label: 成员身份引用用户
source: member
target: user
relationshipType: references
direction: directed
cardinality: many-to-one
summary: Member 通过 user 引用对应的 User。
---

# Member → User｜成员身份引用用户

> Member 是用户在工作空间中的身份记录，因此它必须引用一个 User。

## 关系卡片

| 项目     | 值                              |
| -------- | ------------------------------- |
| 源对象   | [Member](../entities/member.md) |
| 目标对象 | [User](../entities/user.md)     |
| 关系类型 | `references`                    |
| 方向     | Member → User                   |
| 基数     | many-to-one                     |
| 字段     | `user: Ref<String>`             |

## 业务含义

Member 不复制用户信息，只保存用户引用和工作空间内角色。
