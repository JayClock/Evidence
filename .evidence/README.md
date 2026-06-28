# Evidence 当前系统模型

> 这个目录把当前系统模型表达成 **Markdown 文档 + 最小 Frontmatter**。Frontmatter 用于索引和列表渲染，正文用于人类阅读、讨论和编辑。

## 目录结构

```txt
.evidence/
  entities/      # 实体与聚合模型
  associations/  # 关联对象，一条关系一个文件
```

## 阅读约定

- **Frontmatter**：实体文件只保留 `id`、`name`、`label`、`type`、`subType`。
- **正文表格**：描述属性、行为、规则。
- **关联文件**：关系独立表达，避免把关系散落在两个实体文件中。
- **事实源**：当前仍是代码；这些 Markdown 文件是模型视图和本地优先存储格式草案。

## 实体模型

| 模型                                                    | 类型               | 说明                                             |
| ------------------------------------------------------- | ------------------ | ------------------------------------------------ |
| [User](entities/user.md)                                | Aggregate          | 系统用户                                         |
| [Workspace](entities/workspace.md)                      | Aggregate Root     | 建模工作空间                                     |
| [Member](entities/member.md)                            | Entity             | 用户在工作空间中的成员身份                       |
| [LogicalEntity](entities/logical-entity.md)             | Entity             | 证据、参与者、角色、上下文；内嵌 EntityAttribute |
| [LogicalRelationship](entities/logical-relationship.md) | Association Object | 逻辑实体之间的关系                               |
| [Diagram](entities/diagram.md)                          | Aggregate          | 可视化图；内嵌 Viewport                          |
| [DiagramNode](entities/diagram-node.md)                 | Entity             | 图节点；内嵌 Position                            |
| [DiagramEdge](entities/diagram-edge.md)                 | Entity             | 图边                                             |

## 关联对象

| 关系                                                                                              | 说明                 |
| ------------------------------------------------------------------------------------------------- | -------------------- |
| [User → Workspace](associations/user-owns-workspaces.md)                                          | 用户访问工作空间集合 |
| [Workspace → Member](associations/workspace-has-members.md)                                       | 工作空间包含成员     |
| [Member → User](associations/member-belongs-to-user.md)                                           | 成员身份引用用户     |
| [Workspace → LogicalEntity](associations/workspace-has-logical-entities.md)                       | 工作空间包含逻辑实体 |
| [Workspace → LogicalRelationship](associations/workspace-has-logical-relationships.md)            | 工作空间包含逻辑关系 |
| [LogicalRelationship → Source LogicalEntity](associations/logical-relationship-source.md)         | 逻辑关系的源实体     |
| [LogicalRelationship → Target LogicalEntity](associations/logical-relationship-target.md)         | 逻辑关系的目标实体   |
| [Workspace → Diagram](associations/workspace-has-diagrams.md)                                     | 工作空间包含图       |
| [Diagram → DiagramNode](associations/diagram-has-nodes.md)                                        | 图包含节点           |
| [Diagram → DiagramEdge](associations/diagram-has-edges.md)                                        | 图包含边             |
| [DiagramNode → LogicalEntity](associations/diagram-node-references-logical-entity.md)             | 图节点引用逻辑实体   |
| [DiagramEdge → LogicalRelationship](associations/diagram-edge-references-logical-relationship.md) | 图边引用逻辑关系     |
| [DiagramNode → DiagramNode](associations/diagram-node-parent.md)                                  | 图节点父子层级       |
