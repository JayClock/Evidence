use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderName, StatusCode},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::domain::{
    Diagram, DiagramDescription, DiagramEdge, DiagramNode, DiagramStatus, DiagramType,
    DiagramVersion, DraftEdge, DraftNode, EdgeDescription, NodeDescription, Ref, ServerError,
    Viewport, Workspace,
};

use super::{error::ApiError, links::Link, AppState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageQuery {
    page: Option<u32>,
    page_size: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateDiagramInput {
    title: String,
    #[serde(rename = "type")]
    diagram_type: Option<DiagramType>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateDiagramInput {
    title: Option<String>,
    #[serde(rename = "type")]
    diagram_type: Option<DiagramType>,
    status: Option<DiagramStatus>,
    viewport: Option<Viewport>,
    #[serde(rename = "viewport.x")]
    viewport_x: Option<f64>,
    #[serde(rename = "viewport.y")]
    viewport_y: Option<f64>,
    #[serde(rename = "viewport.zoom")]
    viewport_zoom: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NodeInput {
    id: Option<String>,
    #[serde(rename = "type")]
    node_type: String,
    logical_entity: Option<Ref<String>>,
    parent: Option<Ref<String>>,
    #[serde(default)]
    position_x: f64,
    #[serde(default)]
    position_y: f64,
    width: Option<i64>,
    height: Option<i64>,
    #[serde(default = "empty_object")]
    style_config: Value,
    #[serde(default = "empty_object")]
    local_data: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeInput {
    id: Option<String>,
    source_node: Ref<String>,
    target_node: Ref<String>,
    source_handle: Option<String>,
    target_handle: Option<String>,
    relation_type: Option<String>,
    label: Option<String>,
    #[serde(default = "empty_object")]
    style_props: Value,
    #[serde(default)]
    hidden: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitDraftInput {
    #[serde(default)]
    nodes: Vec<NodeInput>,
    #[serde(default)]
    edges: Vec<EdgeInput>,
}

fn empty_object() -> Value {
    json!({})
}

fn node_description(diagram_id: &str, input: NodeInput) -> NodeDescription {
    NodeDescription {
        diagram: Ref::new(diagram_id.to_string()),
        node_type: input.node_type,
        logical_entity: input.logical_entity,
        parent: input.parent,
        position_x: input.position_x,
        position_y: input.position_y,
        width: input.width,
        height: input.height,
        style_config: input.style_config,
        local_data: input.local_data,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn edge_description(diagram_id: &str, input: EdgeInput) -> EdgeDescription {
    EdgeDescription {
        diagram: Ref::new(diagram_id.to_string()),
        source_node: input.source_node,
        target_node: input.target_node,
        source_handle: input.source_handle,
        target_handle: input.target_handle,
        relation_type: input.relation_type,
        label: input.label,
        style_props: input.style_props,
        hidden: input.hidden,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

async fn load_workspace(state: &AppState, workspace_id: &str) -> Result<Workspace, ServerError> {
    state
        .users
        .workspaces()
        .find_by_identity(workspace_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("workspace {workspace_id} not found")))
}

async fn load_diagram(
    state: &AppState,
    workspace_id: &str,
    diagram_id: &str,
) -> Result<(Workspace, Diagram), ApiError> {
    let workspace = load_workspace(state, workspace_id).await?;
    let diagram = workspace
        .diagrams()
        .find_by_identity(diagram_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
    Ok((workspace, diagram))
}

async fn list_diagrams(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(50).min(100);
    let (diagrams, total) = workspace.diagrams_wide().list(page, page_size).await?;
    Ok(Json(diagram_collection_resource(
        &workspace_id,
        &diagrams,
        page,
        page_size,
        total,
    )))
}

async fn create_diagram(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(input): Json<CreateDiagramInput>,
) -> Result<(StatusCode, [(HeaderName, String); 1], Json<Value>), ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let diagram = workspace
        .diagrams_wide()
        .add(DiagramDescription {
            workspace: Ref::new(workspace_id.clone()),
            title: input.title,
            diagram_type: input.diagram_type.unwrap_or(DiagramType::Class),
            viewport: Viewport::default(),
            status: DiagramStatus::Draft,
            created_at: String::new(),
            updated_at: String::new(),
        })
        .await?;
    let location = diagram_href(&workspace_id, diagram.identity());
    Ok((
        StatusCode::CREATED,
        [(header::LOCATION, location)],
        Json(diagram_resource(&diagram)),
    ))
}

async fn get_diagram(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    Ok(Json(diagram_detail_resource(&diagram).await?))
}

async fn update_diagram(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
    Json(input): Json<UpdateDiagramInput>,
) -> Result<Json<Value>, ApiError> {
    let (workspace, existing) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let current = existing.description();
    let mut viewport = input.viewport.unwrap_or_else(|| current.viewport.clone());
    if let Some(x) = input.viewport_x {
        viewport.x = x;
    }
    if let Some(y) = input.viewport_y {
        viewport.y = y;
    }
    if let Some(zoom) = input.viewport_zoom {
        viewport.zoom = zoom;
    }
    let diagram = workspace
        .diagrams_wide()
        .update(
            &diagram_id,
            DiagramDescription {
                workspace: current.workspace.clone(),
                title: input.title.unwrap_or_else(|| current.title.clone()),
                diagram_type: input
                    .diagram_type
                    .unwrap_or_else(|| current.diagram_type.clone()),
                status: input.status.unwrap_or_else(|| current.status.clone()),
                viewport,
                created_at: current.created_at.clone(),
                updated_at: current.updated_at.clone(),
            },
        )
        .await?;
    Ok(Json(diagram_resource(&diagram)))
}

async fn delete_diagram(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    workspace.diagrams_wide().delete(&diagram_id).await?;
    Ok(Json(json!({ "deleted": true })))
}

async fn list_nodes(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let nodes = diagram.nodes().find_all(0, usize::MAX).await?;
    Ok(Json(node_collection_resource(
        &workspace_id,
        &diagram,
        &nodes,
    )))
}

async fn create_node(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
    Json(input): Json<NodeInput>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let id = input.id.clone();
    let node = diagram
        .nodes_wide()
        .add_with_id(id, node_description(&diagram_id, input))
        .await?;
    Ok(Json(node_resource(&workspace_id, &node)))
}

async fn get_node(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id, node_id)): Path<(String, String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let node = diagram
        .nodes()
        .find_by_identity(&node_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("diagram node {node_id} not found")))?;
    Ok(Json(node_resource(&workspace_id, &node)))
}

async fn update_node(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id, node_id)): Path<(String, String, String)>,
    Json(input): Json<NodeInput>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let node = diagram
        .nodes_wide()
        .update(&node_id, node_description(&diagram_id, input))
        .await?;
    Ok(Json(node_resource(&workspace_id, &node)))
}

async fn delete_node(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id, node_id)): Path<(String, String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    diagram.nodes_wide().delete(&node_id).await?;
    Ok(Json(json!({ "deleted": true })))
}

async fn list_edges(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let edges = diagram.edges().find_all(0, usize::MAX).await?;
    Ok(Json(edge_collection_resource(
        &workspace_id,
        &diagram,
        &edges,
    )))
}

async fn create_edge(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
    Json(input): Json<EdgeInput>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let id = input.id.clone();
    let edge = diagram
        .edges_wide()
        .add_with_id(id, edge_description(&diagram_id, input))
        .await?;
    Ok(Json(edge_resource(&workspace_id, &edge)))
}

async fn get_edge(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id, edge_id)): Path<(String, String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let edge = diagram
        .edges()
        .find_by_identity(&edge_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("diagram edge {edge_id} not found")))?;
    Ok(Json(edge_resource(&workspace_id, &edge)))
}

async fn update_edge(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id, edge_id)): Path<(String, String, String)>,
    Json(input): Json<EdgeInput>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let edge = diagram
        .edges_wide()
        .update(&edge_id, edge_description(&diagram_id, input))
        .await?;
    Ok(Json(edge_resource(&workspace_id, &edge)))
}

async fn delete_edge(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id, edge_id)): Path<(String, String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    diagram.edges_wide().delete(&edge_id).await?;
    Ok(Json(json!({ "deleted": true })))
}

async fn list_versions(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let versions = diagram.versions().find_all(0, usize::MAX).await?;
    Ok(Json(version_collection_resource(
        &workspace_id,
        &diagram,
        &versions,
    )))
}

async fn create_version(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let version = diagram.create_version().await?;
    Ok(Json(version_resource(&workspace_id, &version)))
}

async fn commit_draft(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
    Json(input): Json<CommitDraftInput>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let nodes = input
        .nodes
        .into_iter()
        .map(|input| {
            let id = input
                .id
                .clone()
                .ok_or_else(|| ServerError::Validation("draft node id is required".to_string()))?;
            Ok(DraftNode {
                id,
                description: node_description(&diagram_id, input),
            })
        })
        .collect::<Result<Vec<_>, ServerError>>()?;
    let edges = input
        .edges
        .into_iter()
        .map(|input| {
            let id = input.id.clone();
            Ok(DraftEdge {
                id,
                description: edge_description(&diagram_id, input),
            })
        })
        .collect::<Result<Vec<_>, ServerError>>()?;
    workspace
        .diagrams_wide()
        .save_diagram(&diagram_id, nodes, edges)
        .await?;
    Ok(Json(json!({ "committed": true })))
}

async fn publish_diagram(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    workspace
        .diagrams_wide()
        .publish_diagram(&diagram_id)
        .await?;
    Ok(Json(json!({ "published": true })))
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/workspaces/{workspaceId}/diagrams",
            get(list_diagrams).post(create_diagram),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}",
            get(get_diagram).put(update_diagram).delete(delete_diagram),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/nodes",
            get(list_nodes).post(create_node),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/nodes/{nodeId}",
            get(get_node).put(update_node).delete(delete_node),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/edges",
            get(list_edges).post(create_edge),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/edges/{edgeId}",
            get(get_edge).put(update_edge).delete(delete_edge),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/versions",
            get(list_versions).post(create_version),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/commit-draft",
            get(get_diagram).post(commit_draft),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/publish",
            get(get_diagram).post(publish_diagram),
        )
}

fn diagram_href(workspace_id: &str, diagram_id: &str) -> String {
    format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}")
}

fn diagrams_href(workspace_id: &str) -> String {
    format!("/api/workspaces/{workspace_id}/diagrams")
}

fn diagram_resource(diagram: &Diagram) -> Value {
    let workspace_id = diagram.workspace_id();
    let diagram_id = diagram.identity();
    let desc = diagram.description();
    json!({
        "_links": {
            "self": Link::new(diagram_href(workspace_id, diagram_id)),
            "workspace": Link::new(format!("/api/workspaces/{workspace_id}")),
            "collection": Link::new(diagrams_href(workspace_id)),
            "nodes": Link::new(format!("{}/nodes", diagram_href(workspace_id, diagram_id))),
            "edges": Link::new(format!("{}/edges", diagram_href(workspace_id, diagram_id))),
            "versions": Link::new(format!("{}/versions", diagram_href(workspace_id, diagram_id))),
            "commit-draft": Link::new(format!("{}/commit-draft", diagram_href(workspace_id, diagram_id))),
            "publish": Link::new(format!("{}/publish", diagram_href(workspace_id, diagram_id))),
        },
        "id": diagram_id,
        "title": desc.title,
        "type": desc.diagram_type.as_str(),
        "status": desc.status.as_str(),
        "viewport": desc.viewport,
        "createdAt": diagram.created_at(),
        "updatedAt": diagram.updated_at(),
    })
}

async fn diagram_detail_resource(diagram: &Diagram) -> Result<Value, ApiError> {
    let mut resource = diagram_resource(diagram);
    let nodes = diagram.nodes().find_all(0, usize::MAX).await?;
    let edges = diagram.edges().find_all(0, usize::MAX).await?;
    let workspace_id = diagram.workspace_id();
    resource["_embedded"] = json!({
        "nodes": nodes.iter().map(|node| node_resource(workspace_id, node)).collect::<Vec<_>>(),
        "edges": edges.iter().map(|edge| edge_resource(workspace_id, edge)).collect::<Vec<_>>(),
    });
    Ok(resource)
}

fn node_resource(workspace_id: &str, node: &DiagramNode) -> Value {
    let diagram_id = node.diagram_id();
    let node_id = node.identity();
    let desc = node.description();
    json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/nodes/{node_id}")),
            "collection": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/nodes")),
            "diagram": Link::new(diagram_href(workspace_id, diagram_id)),
        },
        "id": node_id,
        "type": desc.node_type,
        "logicalEntity": desc.logical_entity,
        "parent": desc.parent,
        "positionX": desc.position_x,
        "positionY": desc.position_y,
        "width": desc.width,
        "height": desc.height,
        "styleConfig": desc.style_config,
        "localData": desc.local_data,
        "createdAt": node.created_at(),
        "updatedAt": node.updated_at(),
    })
}

fn edge_resource(workspace_id: &str, edge: &DiagramEdge) -> Value {
    let diagram_id = edge.diagram_id();
    let edge_id = edge.identity();
    let desc = edge.description();
    json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/edges/{edge_id}")),
            "collection": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/edges")),
            "diagram": Link::new(diagram_href(workspace_id, diagram_id)),
        },
        "id": edge_id,
        "sourceNode": desc.source_node,
        "targetNode": desc.target_node,
        "sourceHandle": desc.source_handle,
        "targetHandle": desc.target_handle,
        "relationType": desc.relation_type,
        "label": desc.label,
        "styleProps": desc.style_props,
        "hidden": desc.hidden,
        "createdAt": edge.created_at(),
        "updatedAt": edge.updated_at(),
    })
}

fn version_resource(workspace_id: &str, version: &DiagramVersion) -> Value {
    let diagram_id = version.diagram_id();
    let version_id = version.identity();
    json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/versions/{version_id}")),
            "diagram": Link::new(diagram_href(workspace_id, diagram_id)),
        },
        "id": version_id,
        "name": version.description().name,
        "snapshot": version.description().snapshot,
        "createdAt": version.created_at(),
    })
}

fn diagram_collection_resource(
    workspace_id: &str,
    diagrams: &[Diagram],
    page: u32,
    page_size: u32,
    total: u64,
) -> Value {
    let total_pages = if total == 0 {
        0
    } else {
        total.div_ceil(page_size as u64)
    };
    let mut links = serde_json::Map::new();
    links.insert(
        "self".to_string(),
        json!(Link::new(format!(
            "{}?page={page}&pageSize={page_size}",
            diagrams_href(workspace_id)
        ))),
    );
    links.insert(
        "workspace".to_string(),
        json!(Link::new(format!("/api/workspaces/{workspace_id}"))),
    );
    if page > 1 {
        links.insert(
            "prev".to_string(),
            json!(Link::new(format!(
                "{}?page={}&pageSize={page_size}",
                diagrams_href(workspace_id),
                page - 1
            ))),
        );
    }
    if (page as u64) < total_pages {
        links.insert(
            "next".to_string(),
            json!(Link::new(format!(
                "{}?page={}&pageSize={page_size}",
                diagrams_href(workspace_id),
                page + 1
            ))),
        );
    }

    json!({
        "_links": links,
        "_templates": {
            "create-diagram": create_diagram_template(workspace_id),
        },
        "_embedded": {
            "diagrams": diagrams.iter().map(diagram_resource).collect::<Vec<_>>(),
        },
        "page": {
            "number": page,
            "size": page_size,
            "totalElements": total,
            "totalPages": total_pages,
        },
    })
}

fn create_diagram_template(workspace_id: &str) -> Value {
    json!({
        "title": "Create diagram",
        "method": "POST",
        "target": diagrams_href(workspace_id),
        "contentType": "application/json",
        "properties": [
            {
                "name": "title",
                "prompt": "Title",
                "type": "text",
                "required": true,
                "minLength": 1,
            },
            {
                "name": "type",
                "prompt": "Type",
                "type": "text",
                "value": DiagramType::Fulfillment.as_str(),
                "required": false,
                "options": {
                    "inline": [
                        { "value": DiagramType::Fulfillment.as_str(), "prompt": "Fulfillment" },
                        { "value": DiagramType::Flowchart.as_str(), "prompt": "Flowchart" },
                        { "value": DiagramType::Sequence.as_str(), "prompt": "Sequence" },
                        { "value": DiagramType::Class.as_str(), "prompt": "Class" },
                        { "value": DiagramType::Component.as_str(), "prompt": "Component" },
                        { "value": DiagramType::State.as_str(), "prompt": "State" },
                        { "value": DiagramType::Activity.as_str(), "prompt": "Activity" },
                    ],
                },
            },
        ],
    })
}

fn node_collection_resource(workspace_id: &str, diagram: &Diagram, nodes: &[DiagramNode]) -> Value {
    let diagram_id = diagram.identity();
    json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/nodes")),
            "diagram": Link::new(diagram_href(workspace_id, diagram_id)),
        },
        "_embedded": {
            "nodes": nodes.iter().map(|node| node_resource(workspace_id, node)).collect::<Vec<_>>(),
        }
    })
}

fn edge_collection_resource(workspace_id: &str, diagram: &Diagram, edges: &[DiagramEdge]) -> Value {
    let diagram_id = diagram.identity();
    json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/edges")),
            "diagram": Link::new(diagram_href(workspace_id, diagram_id)),
        },
        "_embedded": {
            "edges": edges.iter().map(|edge| edge_resource(workspace_id, edge)).collect::<Vec<_>>(),
        }
    })
}

fn version_collection_resource(
    workspace_id: &str,
    diagram: &Diagram,
    versions: &[DiagramVersion],
) -> Value {
    let diagram_id = diagram.identity();
    json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagrams/{diagram_id}/versions")),
            "diagram": Link::new(diagram_href(workspace_id, diagram_id)),
        },
        "_embedded": {
            "versions": versions.iter().map(|version| version_resource(workspace_id, version)).collect::<Vec<_>>(),
        }
    })
}
