#![allow(dead_code)]

use axum::{routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use utoipa::{OpenApi, ToSchema};

use super::AppState;

pub(super) fn routes() -> Router<AppState> {
    Router::new().route("/api/openapi.json", get(openapi_json))
}

async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(openapi())
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    EvidenceApiDoc::openapi()
}

pub fn openapi_yaml() -> String {
    openapi()
        .to_yaml()
        .expect("failed to serialize OpenAPI as YAML")
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Evidence API",
        version = "0.1.0",
        description = "Contract-first API for Evidence runtime implementations."
    ),
    servers((url = "http://127.0.0.1:3000", description = "Rust Axum local server")),
    paths(
        get_root,
        get_health,
        get_user,
        get_user_sidebar,
        list_workspaces,
        create_workspace,
        get_workspace,
        update_workspace,
        delete_workspace,
        list_workspace_members,
        add_workspace_member,
        get_workspace_member,
        list_diagrams,
        create_diagram,
        get_diagram,
        update_diagram,
        delete_diagram,
        list_diagram_nodes,
        get_diagram_node,
        list_diagram_edges,
        get_diagram_edge,
        get_diagram_for_propose_model,
        propose_diagram_model,
        list_logical_entities,
        create_logical_entity,
        get_logical_entity,
        update_logical_entity,
        delete_logical_entity,
        list_logical_relationships,
        create_logical_relationship,
        get_logical_relationship,
        update_logical_relationship,
        delete_logical_relationship,
    ),
    components(schemas(
        AddMemberInput,
        CreateDiagramInput,
        CreateLogicalEntityInput,
        DeletedResult,
        DiagramCollectionResource,
        DiagramResource,
        EdgeCollectionResource,
        EdgeResource,
        ErrorBody,
        HealthResource,
        Link,
        LogicalEntityCollectionResource,
        LogicalEntityResource,
        LogicalEntityType,
        LogicalRelationshipCollectionResource,
        LogicalRelationshipResource,
        CreateLogicalRelationshipInput,
        UpdateLogicalRelationshipInput,
        MemberCollectionResource,
        MemberResource,
        NodeCollectionResource,
        NodeResource,
        Position,
        ProposeModelInput,
        RefModel,
        RootResource,
        SidebarItem,
        SidebarResource,
        SidebarSection,
        UpdateDiagramInput,
        UpdateLogicalEntityInput,
        UserResource,
        Viewport,
        WorkspaceCollectionResource,
        WorkspaceInput,
        WorkspaceResource,
    ))
)]
struct EvidenceApiDoc;

type Links = BTreeMap<String, Link>;
type Templates = BTreeMap<String, Template>;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Link {
    pub href: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TemplateProperty {
    pub name: String,
    pub prompt: Option<String>,
    #[serde(rename = "type")]
    pub property_type: Option<String>,
    pub required: Option<bool>,
    pub min_length: Option<u32>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub title: String,
    pub method: String,
    pub target: String,
    pub content_type: String,
    pub properties: Vec<TemplateProperty>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ErrorBody {
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DeletedResult {
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PageModel {
    pub number: u32,
    pub size: u32,
    pub total_elements: u64,
    pub total_pages: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RefModel {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LinkedRefModel {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RootResource {
    #[serde(rename = "_links")]
    pub links: Links,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct HealthResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub status: String,
    pub service: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct UserResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub name: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SidebarItem {
    pub key: String,
    pub label: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub href: String,
    pub path: String,
    pub icon: String,
    pub active: Option<bool>,
    pub rel: Option<String>,
    pub template: Option<String>,
    pub default_open: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SidebarSection {
    pub title: String,
    pub key: String,
    pub default_open: bool,
    pub items: Vec<SidebarItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SidebarResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub sections: Vec<SidebarSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInput {
    pub title: Option<String>,
    pub path: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub metadata: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub metadata: BTreeMap<String, String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WorkspaceCollectionEmbedded {
    pub workspaces: Vec<WorkspaceResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WorkspaceCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: WorkspaceCollectionEmbedded,
    pub page: PageModel,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AddMemberInput {
    pub user: RefModel,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MemberResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub workspace: LinkedRefModel,
    pub user: LinkedRefModel,
    pub role: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MemberCollectionEmbedded {
    pub members: Vec<MemberResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct MemberCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: MemberCollectionEmbedded,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateDiagramInput {
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDiagramInput {
    pub title: Option<String>,
    pub viewport: Option<Viewport>,
    #[serde(rename = "viewport.x")]
    pub viewport_x: Option<f64>,
    #[serde(rename = "viewport.y")]
    pub viewport_y: Option<f64>,
    #[serde(rename = "viewport.zoom")]
    pub viewport_zoom: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagramResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_templates")]
    pub templates: Templates,
    pub id: String,
    pub title: String,
    pub viewport: Viewport,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DiagramCollectionEmbedded {
    pub diagrams: Vec<DiagramResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DiagramCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_templates")]
    pub templates: Templates,
    #[serde(rename = "_embedded")]
    pub embedded: DiagramCollectionEmbedded,
    pub page: PageModel,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NodeEmbedded {
    #[serde(rename = "logical-entity")]
    pub logical_entity: LogicalEntityResource,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NodeResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: Option<NodeEmbedded>,
    pub id: String,
    pub kind: String,
    pub parent: Option<RefModel>,
    pub position: Position,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub data: BTreeMap<String, serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct NodeCollectionEmbedded {
    pub nodes: Vec<NodeResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct NodeCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: NodeCollectionEmbedded,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EdgeResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub source: RefModel,
    pub target: RefModel,
    pub logical_relationship: Option<RefModel>,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub kind: Option<String>,
    pub style: BTreeMap<String, serde_json::Value>,
    pub data: BTreeMap<String, serde_json::Value>,
    pub animated: bool,
    pub hidden: bool,
    pub marker_start: Option<BTreeMap<String, serde_json::Value>>,
    pub marker_end: Option<BTreeMap<String, serde_json::Value>>,
    pub path_options: BTreeMap<String, serde_json::Value>,
    pub interaction_width: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct EdgeCollectionEmbedded {
    pub edges: Vec<EdgeResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct EdgeCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: EdgeCollectionEmbedded,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProposeModelInput {
    pub requirement: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LogicalEntityType {
    Evidence,
    Participant,
    Role,
    Context,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateLogicalEntityInput {
    pub name: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
    #[serde(default)]
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLogicalEntityInput {
    pub name: Option<String>,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub entity_type: Option<LogicalEntityType>,
    pub sub_type: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogicalEntityResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LogicalEntityCollectionEmbedded {
    #[serde(rename = "logicalEntities")]
    pub logical_entities: Vec<LogicalEntityResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LogicalEntityCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: LogicalEntityCollectionEmbedded,
    pub page: PageModel,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateLogicalRelationshipInput {
    pub source: RefModel,
    pub target: RefModel,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLogicalRelationshipInput {
    pub source: Option<RefModel>,
    pub target: Option<RefModel>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogicalRelationshipResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub source: RefModel,
    pub target: RefModel,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LogicalRelationshipCollectionEmbedded {
    #[serde(rename = "logicalRelationships")]
    pub logical_relationships: Vec<LogicalRelationshipResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct LogicalRelationshipCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: LogicalRelationshipCollectionEmbedded,
    pub page: PageModel,
}

#[utoipa::path(
    get,
    path = "/api",
    responses((status = 200, description = "API root resource", body = RootResource, content_type = "application/vnd.evidence.root+json"))
)]
fn get_root() {}

#[utoipa::path(
    get,
    path = "/health",
    responses((status = 200, description = "Health resource", body = HealthResource, content_type = "application/vnd.evidence.health+json"))
)]
fn get_health() {}

#[utoipa::path(
    get,
    path = "/api/users/{userId}",
    params(("userId" = String, Path, description = "User id")),
    responses(
        (status = 200, description = "User resource", body = UserResource, content_type = "application/vnd.evidence.user+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_user() {}

#[utoipa::path(
    get,
    path = "/api/users/{userId}/sidebar",
    params(("userId" = String, Path, description = "User id")),
    responses(
        (status = 200, description = "Sidebar resource", body = SidebarResource, content_type = "application/vnd.evidence.sidebar+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_user_sidebar() {}

#[utoipa::path(
    get,
    path = "/api/users/{userId}/workspaces",
    params(
        ("userId" = String, Path, description = "User id"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("pageSize" = Option<u32>, Query, description = "Page size")
    ),
    responses(
        (status = 200, description = "Workspace collection", body = WorkspaceCollectionResource, content_type = "application/vnd.evidence.workspaces+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_workspaces() {}

#[utoipa::path(
    post,
    path = "/api/users/{userId}/workspaces",
    params(("userId" = String, Path, description = "User id")),
    request_body(content = WorkspaceInput, content_type = "application/json"),
    responses(
        (status = 201, description = "Created workspace", body = WorkspaceResource, content_type = "application/vnd.evidence.workspaces+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn create_workspace() {}

#[utoipa::path(
    get,
    path = "/api/users/{userId}/workspaces/{workspaceId}",
    params(("userId" = String, Path), ("workspaceId" = String, Path)),
    responses(
        (status = 200, description = "Workspace resource", body = WorkspaceResource, content_type = "application/vnd.evidence.workspace+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_workspace() {}

#[utoipa::path(
    put,
    path = "/api/users/{userId}/workspaces/{workspaceId}",
    params(("userId" = String, Path), ("workspaceId" = String, Path)),
    request_body(content = WorkspaceInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Updated workspace", body = WorkspaceResource, content_type = "application/vnd.evidence.workspace+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn update_workspace() {}

#[utoipa::path(
    delete,
    path = "/api/users/{userId}/workspaces/{workspaceId}",
    params(("userId" = String, Path), ("workspaceId" = String, Path)),
    responses((status = 204, description = "Workspace soft-deleted"), (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json"))
)]
fn delete_workspace() {}

#[utoipa::path(
    get,
    path = "/api/users/{userId}/workspaces/{workspaceId}/members",
    params(("userId" = String, Path), ("workspaceId" = String, Path)),
    responses(
        (status = 200, description = "Workspace member collection", body = MemberCollectionResource, content_type = "application/vnd.evidence.members+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_workspace_members() {}

#[utoipa::path(
    post,
    path = "/api/users/{userId}/workspaces/{workspaceId}/members",
    params(("userId" = String, Path), ("workspaceId" = String, Path)),
    request_body(content = AddMemberInput, content_type = "application/json"),
    responses(
        (status = 201, description = "Added workspace member", body = MemberResource, content_type = "application/vnd.evidence.members+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn add_workspace_member() {}

#[utoipa::path(
    get,
    path = "/api/users/{userId}/workspaces/{workspaceId}/members/{memberId}",
    params(("userId" = String, Path), ("workspaceId" = String, Path), ("memberId" = String, Path)),
    responses(
        (status = 200, description = "Workspace member resource", body = MemberResource, content_type = "application/vnd.evidence.member+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_workspace_member() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams",
    params(("workspaceId" = String, Path), ("page" = Option<u32>, Query), ("pageSize" = Option<u32>, Query)),
    responses(
        (status = 200, description = "Diagram collection", body = DiagramCollectionResource, content_type = "application/vnd.evidence.diagrams+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_diagrams() {}

#[utoipa::path(
    post,
    path = "/api/workspaces/{workspaceId}/diagrams",
    params(("workspaceId" = String, Path)),
    request_body(content = CreateDiagramInput, content_type = "application/json"),
    responses(
        (status = 201, description = "Created diagram", body = DiagramResource, content_type = "application/vnd.evidence.diagrams+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn create_diagram() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram resource", body = DiagramResource, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_diagram() {}

#[utoipa::path(
    put,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    request_body(content = UpdateDiagramInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Updated diagram", body = DiagramResource, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn update_diagram() {}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram delete result", body = DeletedResult, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn delete_diagram() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/nodes",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram node collection", body = NodeCollectionResource, content_type = "application/vnd.evidence.nodes+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_diagram_nodes() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/nodes/{nodeId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path), ("nodeId" = String, Path)),
    responses(
        (status = 200, description = "Diagram node resource", body = NodeResource, content_type = "application/vnd.evidence.node+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_diagram_node() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/edges",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram edge collection", body = EdgeCollectionResource, content_type = "application/vnd.evidence.edges+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_diagram_edges() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/edges/{edgeId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path), ("edgeId" = String, Path)),
    responses(
        (status = 200, description = "Diagram edge resource", body = EdgeResource, content_type = "application/vnd.evidence.edge+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_diagram_edge() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/propose-model",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram resource", body = DiagramResource, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_diagram_for_propose_model() {}

#[utoipa::path(
    post,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/propose-model",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    request_body(content = ProposeModelInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Server-sent modeling proposal stream", content_type = "text/event-stream", body = String),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn propose_diagram_model() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/logical-entities",
    params(("workspaceId" = String, Path), ("page" = Option<u32>, Query), ("pageSize" = Option<u32>, Query)),
    responses(
        (status = 200, description = "Logical entity collection", body = LogicalEntityCollectionResource, content_type = "application/vnd.evidence.logical-entities+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_logical_entities() {}

#[utoipa::path(
    post,
    path = "/api/workspaces/{workspaceId}/logical-entities",
    params(("workspaceId" = String, Path)),
    request_body(content = CreateLogicalEntityInput, content_type = "application/json"),
    responses(
        (status = 201, description = "Created logical entity", body = LogicalEntityResource, content_type = "application/vnd.evidence.logical-entities+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn create_logical_entity() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/logical-entities/{entityId}",
    params(("workspaceId" = String, Path), ("entityId" = String, Path)),
    responses(
        (status = 200, description = "Logical entity resource", body = LogicalEntityResource, content_type = "application/vnd.evidence.logical-entity+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_logical_entity() {}

#[utoipa::path(
    put,
    path = "/api/workspaces/{workspaceId}/logical-entities/{entityId}",
    params(("workspaceId" = String, Path), ("entityId" = String, Path)),
    request_body(content = UpdateLogicalEntityInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Updated logical entity", body = LogicalEntityResource, content_type = "application/vnd.evidence.logical-entity+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn update_logical_entity() {}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{workspaceId}/logical-entities/{entityId}",
    params(("workspaceId" = String, Path), ("entityId" = String, Path)),
    responses(
        (status = 200, description = "Logical entity delete result", body = DeletedResult, content_type = "application/vnd.evidence.logical-entity+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn delete_logical_entity() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/logical-relationships",
    params(("workspaceId" = String, Path), ("page" = Option<u32>, Query), ("pageSize" = Option<u32>, Query)),
    responses(
        (status = 200, description = "Logical relationship collection", body = LogicalRelationshipCollectionResource, content_type = "application/vnd.evidence.logical-relationships+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_logical_relationships() {}

#[utoipa::path(
    post,
    path = "/api/workspaces/{workspaceId}/logical-relationships",
    params(("workspaceId" = String, Path)),
    request_body(content = CreateLogicalRelationshipInput, content_type = "application/json"),
    responses(
        (status = 201, description = "Created logical relationship", body = LogicalRelationshipResource, content_type = "application/vnd.evidence.logical-relationships+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn create_logical_relationship() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/logical-relationships/{relationshipId}",
    params(("workspaceId" = String, Path), ("relationshipId" = String, Path)),
    responses(
        (status = 200, description = "Logical relationship resource", body = LogicalRelationshipResource, content_type = "application/vnd.evidence.logical-relationship+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_logical_relationship() {}

#[utoipa::path(
    put,
    path = "/api/workspaces/{workspaceId}/logical-relationships/{relationshipId}",
    params(("workspaceId" = String, Path), ("relationshipId" = String, Path)),
    request_body(content = UpdateLogicalRelationshipInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Updated logical relationship", body = LogicalRelationshipResource, content_type = "application/vnd.evidence.logical-relationship+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn update_logical_relationship() {}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{workspaceId}/logical-relationships/{relationshipId}",
    params(("workspaceId" = String, Path), ("relationshipId" = String, Path)),
    responses(
        (status = 200, description = "Logical relationship delete result", body = DeletedResult, content_type = "application/vnd.evidence.logical-relationship+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn delete_logical_relationship() {}
