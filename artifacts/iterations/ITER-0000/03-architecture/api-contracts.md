# API 契约

Evidence API 使用 REST + HAL 风格。所有资源应包含 `_links`，集合响应应包含 `_embedded` 和 `page`。本文记录当前架构阶段的 API 契约，用于指导后续实现、OpenAPI 导出和前端 client 生成。

## 通用约定

### Base URLs

| 环境        | 地址                                               |
| ----------- | -------------------------------------------------- |
| Backend dev | `http://127.0.0.1:3000`                            |
| Web dev     | `http://127.0.0.1:4200` 或 `http://localhost:4200` |
| Desktop dev | Tauri WebView 加载 `http://127.0.0.1:4200`         |

### HAL Resource

```json
{
  "id": "resource-id",
  "description": {},
  "_links": {
    "self": { "href": "/api/..." },
    "collection": { "href": "/api/..." }
  }
}
```

### HAL Collection

```json
{
  "_embedded": {
    "items": []
  },
  "_links": {
    "self": { "href": "/api/resources?page=1&pageSize=50" }
  },
  "page": {
    "page": 1,
    "pageSize": 50,
    "total": 0
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "not_found | validation | conflict | internal",
    "message": "Human readable error message",
    "details": {}
  },
  "_links": {
    "help": { "href": "/api" }
  }
}
```

## Root 与 Health

| Method | Path      | 说明                                         |
| ------ | --------- | -------------------------------------------- |
| GET    | `/health` | 健康检查。                                   |
| GET    | `/api`    | API root，提供 health 和 default-user 链接。 |

### GET `/api`

```json
{
  "_links": {
    "self": { "href": "/api" },
    "health": { "href": "/health" },
    "default-user": { "href": "/api/users/desktop-user" }
  }
}
```

## User API

| Method | Path                                  | 说明                 |
| ------ | ------------------------------------- | -------------------- |
| GET    | `/api/users/{userId}`                 | 获取用户资源。       |
| GET    | `/api/users/{userId}/workspaces`      | 获取用户工作区列表。 |
| POST   | `/api/users/{userId}/workspaces`      | 创建工作区。         |
| GET    | `/api/users/{userId}/workspaces/{id}` | 获取工作区。         |
| PUT    | `/api/users/{userId}/workspaces/{id}` | 更新工作区。         |
| DELETE | `/api/users/{userId}/workspaces/{id}` | 删除工作区。         |

### User Resource

```json
{
  "id": "desktop-user",
  "description": {
    "name": "Desktop User"
  },
  "_links": {
    "self": { "href": "/api/users/desktop-user" },
    "workspaces": { "href": "/api/users/desktop-user/workspaces" }
  }
}
```

### Create Workspace Request

```json
{
  "name": "Default Workspace",
  "description": "Workspace description"
}
```

### Workspace Resource

```json
{
  "id": "default-workspace",
  "description": {
    "name": "Default Workspace",
    "description": "Workspace description"
  },
  "_links": {
    "self": { "href": "/api/users/desktop-user/workspaces/default-workspace" },
    "collection": { "href": "/api/users/desktop-user/workspaces" },
    "members": { "href": "/api/users/desktop-user/workspaces/default-workspace/members" },
    "diagrams": { "href": "/api/workspaces/default-workspace/diagrams" },
    "logical-entities": { "href": "/api/workspaces/default-workspace/logical-entities" }
  }
}
```

## Workspace Member API

| Method | Path                                                | 说明             |
| ------ | --------------------------------------------------- | ---------------- |
| GET    | `/api/users/{userId}/workspaces/{id}/members`       | 获取工作区成员。 |
| POST   | `/api/users/{userId}/workspaces/{id}/members`       | 添加成员。       |
| DELETE | `/api/users/{userId}/workspaces/{id}/members/{mid}` | 删除成员。       |

### Add Member Request

```json
{
  "userId": "user-id",
  "role": "owner | member"
}
```

### Member Resource

```json
{
  "id": "member-id",
  "userId": "desktop-user",
  "workspaceId": "default-workspace",
  "role": "owner",
  "_links": {
    "self": { "href": "/api/users/desktop-user/workspaces/default-workspace/members/member-id" },
    "workspace": { "href": "/api/users/desktop-user/workspaces/default-workspace" },
    "user": { "href": "/api/users/desktop-user" }
  }
}
```

## Logical Entity API

| Method | Path                                          | 说明                     |
| ------ | --------------------------------------------- | ------------------------ |
| GET    | `/api/workspaces/{id}/logical-entities`       | 获取工作区逻辑实体列表。 |
| POST   | `/api/workspaces/{id}/logical-entities`       | 创建逻辑实体。           |
| GET    | `/api/workspaces/{id}/logical-entities/{eid}` | 获取逻辑实体详情。       |
| PUT    | `/api/workspaces/{id}/logical-entities/{eid}` | 更新逻辑实体。           |
| DELETE | `/api/workspaces/{id}/logical-entities/{eid}` | 删除逻辑实体。           |

### Logical Entity Types

| Type          | Allowed sub types                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `EVIDENCE`    | `rfp`、`proposal`、`contract`、`fulfillment_request`、`fulfillment_confirmation`、`other_evidence` |
| `PARTICIPANT` | `party`、`thing`                                                                                   |
| `ROLE`        | `party`、`domain`、`3rd system`、`context`、`evidence`                                             |
| `CONTEXT`     | `bounded_context`                                                                                  |

### Create Logical Entity Request

```json
{
  "type": "EVIDENCE",
  "subType": "contract",
  "definition": "A signed agreement that proves commercial commitment.",
  "attributes": [{ "name": "effectiveDate", "type": "date", "description": "Contract effective date" }],
  "behaviors": [{ "name": "validate", "description": "Validate contract completeness" }],
  "tags": ["commercial", "evidence"]
}
```

### Logical Entity Resource

```json
{
  "id": "logical-entity-id",
  "workspaceId": "default-workspace",
  "type": "EVIDENCE",
  "subType": "contract",
  "definition": "A signed agreement that proves commercial commitment.",
  "attributes": [],
  "behaviors": [],
  "tags": [],
  "_links": {
    "self": { "href": "/api/workspaces/default-workspace/logical-entities/logical-entity-id" },
    "collection": { "href": "/api/workspaces/default-workspace/logical-entities" },
    "workspace": { "href": "/api/users/desktop-user/workspaces/default-workspace" }
  }
}
```

## Diagram API

| Method | Path                                  | 说明                                |
| ------ | ------------------------------------- | ----------------------------------- |
| GET    | `/api/workspaces/{id}/diagrams`       | 获取工作区图列表。                  |
| POST   | `/api/workspaces/{id}/diagrams`       | 创建图。                            |
| GET    | `/api/workspaces/{id}/diagrams/{did}` | 获取图详情，可内嵌 nodes 和 edges。 |
| PUT    | `/api/workspaces/{id}/diagrams/{did}` | 更新图。                            |
| DELETE | `/api/workspaces/{id}/diagrams/{did}` | 删除图。                            |

### Create Diagram Request

```json
{
  "name": "Evidence Map",
  "description": "Map evidence, participants, roles, and contexts."
}
```

### Diagram Resource

```json
{
  "id": "diagram-id",
  "workspaceId": "default-workspace",
  "description": {
    "name": "Evidence Map",
    "description": "Map evidence, participants, roles, and contexts."
  },
  "_embedded": {
    "nodes": [],
    "edges": []
  },
  "_links": {
    "self": { "href": "/api/workspaces/default-workspace/diagrams/diagram-id" },
    "collection": { "href": "/api/workspaces/default-workspace/diagrams" },
    "nodes": { "href": "/api/workspaces/default-workspace/diagrams/diagram-id/nodes" },
    "edges": { "href": "/api/workspaces/default-workspace/diagrams/diagram-id/edges" }
  }
}
```

## Diagram Node API

| Method | Path                                              | 说明             |
| ------ | ------------------------------------------------- | ---------------- |
| GET    | `/api/workspaces/{id}/diagrams/{did}/nodes`       | 获取图节点。     |
| POST   | `/api/workspaces/{id}/diagrams/{did}/nodes`       | 创建图节点。     |
| GET    | `/api/workspaces/{id}/diagrams/{did}/nodes/{nid}` | 获取图节点详情。 |
| PUT    | `/api/workspaces/{id}/diagrams/{did}/nodes/{nid}` | 更新图节点。     |
| DELETE | `/api/workspaces/{id}/diagrams/{did}/nodes/{nid}` | 删除图节点。     |

### Create Node Request

```json
{
  "nodeType": "logical_entity",
  "logicalEntityId": "logical-entity-id",
  "position": { "x": 120, "y": 240 },
  "style": { "color": "#3b82f6", "shape": "rounded-rectangle" }
}
```

## Diagram Edge API

| Method | Path                                              | 说明           |
| ------ | ------------------------------------------------- | -------------- |
| GET    | `/api/workspaces/{id}/diagrams/{did}/edges`       | 获取图边。     |
| POST   | `/api/workspaces/{id}/diagrams/{did}/edges`       | 创建图边。     |
| GET    | `/api/workspaces/{id}/diagrams/{did}/edges/{eid}` | 获取图边详情。 |
| PUT    | `/api/workspaces/{id}/diagrams/{did}/edges/{eid}` | 更新图边。     |
| DELETE | `/api/workspaces/{id}/diagrams/{did}/edges/{eid}` | 删除图边。     |

### Create Edge Request

```json
{
  "sourceNodeId": "source-node-id",
  "targetNodeId": "target-node-id",
  "relationType": "proves | produced_by | belongs_to | plays_role | depends_on | related_to",
  "label": "proves"
}
```

## API 验收规则

- 所有 resource 响应必须有 `_links.self`。
- 所有 collection 响应必须有 `_embedded` 和 `page`。
- 集合接口统一支持 `page` 和 `pageSize`。
- 删除操作应遵循 soft delete，并确保后续列表不可见。
- 创建节点/边时必须校验引用存在性。
- 错误必须映射到 NotFound、Validation、Conflict 或 Internal。
- OpenAPI 导出后必须能生成前端 TypeScript schema。
