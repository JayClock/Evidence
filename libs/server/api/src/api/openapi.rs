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
        create_diagram_node,
        get_diagram_node,
        update_diagram_node,
        delete_diagram_node,
        list_diagram_edges,
        create_diagram_edge,
        get_diagram_edge,
        update_diagram_edge,
        delete_diagram_edge,
        list_diagram_versions,
        create_diagram_version,
        get_diagram_for_commit_draft,
        commit_diagram_draft,
        get_diagram_for_publish,
        publish_diagram,
        get_diagram_for_propose_model,
        propose_diagram_model,
        list_logical_entities,
        create_logical_entity,
        get_logical_entity,
        update_logical_entity,
        delete_logical_entity,
    ),
    components(schemas(
        AddMemberInput,
        CommitDraftInput,
        CreateDiagramInput,
        CreateLogicalEntityInput,
        DeletedResult,
        DiagramCollectionResource,
        DiagramDetailResource,
        DiagramResource,
        DiagramSnapshot,
        DiagramStatus,
        DiagramType,
        DiagramVersionCollectionResource,
        DiagramVersionResource,
        EdgeCollectionResource,
        EdgeInput,
        EdgeResource,
        EntityAttribute,
        EntityBehavior,
        EntityDefinition,
        ErrorBody,
        HealthResource,
        Link,
        LogicalEntityCollectionResource,
        LogicalEntityResource,
        LogicalEntityType,
        MemberCollectionResource,
        MemberResource,
        NodeCollectionResource,
        NodeInput,
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
    pub title: String,
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
#[serde(rename_all = "lowercase")]
pub enum DiagramType {
    Flowchart,
    Sequence,
    Class,
    Component,
    State,
    Activity,
    Fulfillment,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DiagramStatus {
    Draft,
    Published,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateDiagramInput {
    pub title: String,
    #[serde(rename = "type")]
    pub diagram_type: Option<DiagramType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDiagramInput {
    pub title: Option<String>,
    #[serde(rename = "type")]
    pub diagram_type: Option<DiagramType>,
    pub status: Option<DiagramStatus>,
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
    #[serde(rename = "type")]
    pub diagram_type: DiagramType,
    pub status: DiagramStatus,
    pub viewport: Viewport,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DiagramDetailEmbedded {
    pub nodes: Vec<NodeResource>,
    pub edges: Vec<EdgeResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DiagramDetailResource {
    #[serde(flatten)]
    pub diagram: DiagramResource,
    #[serde(rename = "_embedded")]
    pub embedded: DiagramDetailEmbedded,
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
pub struct NodeInput {
    pub id: Option<String>,
    pub kind: String,
    pub logical_entity: Option<RefModel>,
    pub parent: Option<RefModel>,
    pub position: Option<Position>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub data: Option<BTreeMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NodeResource {
    #[serde(rename = "_links")]
    pub links: Links,
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
pub struct EdgeInput {
    pub id: Option<String>,
    pub source: RefModel,
    pub target: RefModel,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub kind: Option<String>,
    pub relation_type: Option<String>,
    pub label: Option<String>,
    pub style: Option<BTreeMap<String, serde_json::Value>>,
    pub data: Option<BTreeMap<String, serde_json::Value>>,
    pub animated: Option<bool>,
    pub hidden: Option<bool>,
    pub marker_start: Option<BTreeMap<String, serde_json::Value>>,
    pub marker_end: Option<BTreeMap<String, serde_json::Value>>,
    pub path_options: Option<BTreeMap<String, serde_json::Value>>,
    pub interaction_width: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EdgeResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub source: RefModel,
    pub target: RefModel,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub kind: Option<String>,
    pub relation_type: Option<String>,
    pub label: Option<String>,
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
pub struct SnapshotNode {
    pub id: String,
    pub description: NodeInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct SnapshotEdge {
    pub id: Option<String>,
    pub description: EdgeInput,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DiagramSnapshot {
    pub nodes: Vec<SnapshotNode>,
    pub edges: Vec<SnapshotEdge>,
    pub viewport: Viewport,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DiagramVersionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    pub name: String,
    pub snapshot: DiagramSnapshot,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DiagramVersionCollectionEmbedded {
    pub versions: Vec<DiagramVersionResource>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct DiagramVersionCollectionResource {
    #[serde(rename = "_links")]
    pub links: Links,
    #[serde(rename = "_embedded")]
    pub embedded: DiagramVersionCollectionEmbedded,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CommitDraftInput {
    pub nodes: Option<Vec<NodeInput>>,
    pub edges: Option<Vec<EdgeInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CommitResult {
    pub committed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct PublishResult {
    pub published: bool,
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
pub struct EntityAttribute {
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub attribute_type: Option<String>,
    pub description: Option<String>,
    pub is_business_key: bool,
    pub relation: bool,
    pub visibility: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityBehavior {
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub return_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct EntityDefinition {
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub attributes: Vec<EntityAttribute>,
    pub behaviors: Vec<EntityBehavior>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateLogicalEntityInput {
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
    pub name: String,
    pub label: Option<String>,
    pub definition: Option<EntityDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLogicalEntityInput {
    #[serde(rename = "type")]
    pub entity_type: Option<LogicalEntityType>,
    pub sub_type: Option<String>,
    pub name: Option<String>,
    pub label: Option<String>,
    pub definition: Option<EntityDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogicalEntityResource {
    #[serde(rename = "_links")]
    pub links: Links,
    pub id: String,
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
    pub name: String,
    pub label: Option<String>,
    pub definition: Option<EntityDefinition>,
    pub created_at: String,
    pub updated_at: String,
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
        (status = 200, description = "Diagram detail resource", body = DiagramDetailResource, content_type = "application/vnd.evidence.diagram+json"),
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
    post,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/nodes",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    request_body(content = NodeInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Created diagram node", body = NodeResource, content_type = "application/vnd.evidence.nodes+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn create_diagram_node() {}

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
    put,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/nodes/{nodeId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path), ("nodeId" = String, Path)),
    request_body(content = NodeInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Updated diagram node", body = NodeResource, content_type = "application/vnd.evidence.node+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn update_diagram_node() {}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/nodes/{nodeId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path), ("nodeId" = String, Path)),
    responses(
        (status = 200, description = "Diagram node delete result", body = DeletedResult, content_type = "application/vnd.evidence.node+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn delete_diagram_node() {}

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
    post,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/edges",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    request_body(content = EdgeInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Created diagram edge", body = EdgeResource, content_type = "application/vnd.evidence.edges+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn create_diagram_edge() {}

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
    put,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/edges/{edgeId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path), ("edgeId" = String, Path)),
    request_body(content = EdgeInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Updated diagram edge", body = EdgeResource, content_type = "application/vnd.evidence.edge+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn update_diagram_edge() {}

#[utoipa::path(
    delete,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/edges/{edgeId}",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path), ("edgeId" = String, Path)),
    responses(
        (status = 200, description = "Diagram edge delete result", body = DeletedResult, content_type = "application/vnd.evidence.edge+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn delete_diagram_edge() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/versions",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram version collection", body = DiagramVersionCollectionResource, content_type = "application/vnd.evidence.diagram-versions+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn list_diagram_versions() {}

#[utoipa::path(
    post,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/versions",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Created diagram version", body = DiagramVersionResource, content_type = "application/vnd.evidence.diagram-versions+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn create_diagram_version() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/commit-draft",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram detail resource", body = DiagramDetailResource, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_diagram_for_commit_draft() {}

#[utoipa::path(
    post,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/commit-draft",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    request_body(content = CommitDraftInput, content_type = "application/json"),
    responses(
        (status = 200, description = "Draft commit result", body = CommitResult, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn commit_diagram_draft() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/publish",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram detail resource", body = DiagramDetailResource, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn get_diagram_for_publish() {}

#[utoipa::path(
    post,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/publish",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Publish result", body = PublishResult, content_type = "application/vnd.evidence.diagram+json"),
        (status = 400, description = "Validation error", body = ErrorBody, content_type = "application/json"),
        (status = 404, description = "Resource not found", body = ErrorBody, content_type = "application/json"),
        (status = 409, description = "Conflict", body = ErrorBody, content_type = "application/json"),
        (status = 500, description = "Internal server error", body = ErrorBody, content_type = "application/json")
    )
)]
fn publish_diagram() {}

#[utoipa::path(
    get,
    path = "/api/workspaces/{workspaceId}/diagrams/{diagramId}/propose-model",
    params(("workspaceId" = String, Path), ("diagramId" = String, Path)),
    responses(
        (status = 200, description = "Diagram detail resource", body = DiagramDetailResource, content_type = "application/vnd.evidence.diagram+json"),
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
