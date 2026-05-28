use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderName, StatusCode},
    response::sse::{Event, Sse},
    routing::get,
    Json, Router,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::domain::{
    Diagram, DiagramDescription, DiagramEdge, DiagramNode, DiagramStatus, DiagramType,
    DiagramVersion, DraftEdge, DraftNode, EdgeDescription, ModelingEvent, NodeDescription,
    Position, Ref, ServerError, Viewport, Workspace,
};

use super::{
    error::ApiError,
    links::Link,
    model::{diagram_model, edge_model, node_model, DiagramModel, EdgeModel, NodeModel},
    AppState,
};

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
    kind: String,
    logical_entity: Option<Ref<String>>,
    parent: Option<Ref<String>>,
    #[serde(default)]
    position: Position,
    width: Option<i64>,
    height: Option<i64>,
    #[serde(default = "empty_object")]
    data: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeInput {
    id: Option<String>,
    source: Ref<String>,
    target: Ref<String>,
    source_handle: Option<String>,
    target_handle: Option<String>,
    kind: Option<String>,
    relation_type: Option<String>,
    label: Option<String>,
    #[serde(default = "empty_object")]
    style: Value,
    #[serde(default = "empty_object")]
    data: Value,
    #[serde(default)]
    animated: bool,
    #[serde(default)]
    hidden: bool,
    #[serde(default = "null_value")]
    marker_start: Value,
    #[serde(default = "null_value")]
    marker_end: Value,
    #[serde(default = "empty_object")]
    path_options: Value,
    interaction_width: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitDraftInput {
    #[serde(default)]
    nodes: Vec<NodeInput>,
    #[serde(default)]
    edges: Vec<EdgeInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProposeModelInput {
    requirement: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StructuredChunkPayload {
    kind: String,
    format: String,
    chunk: String,
}

fn empty_object() -> Value {
    json!({})
}

fn null_value() -> Value {
    Value::Null
}

fn node_description(diagram_id: &str, input: NodeInput) -> NodeDescription {
    NodeDescription {
        diagram: Ref::new(diagram_id.to_string()),
        kind: input.kind,
        logical_entity: input.logical_entity,
        parent: input.parent,
        position: input.position,
        width: input.width,
        height: input.height,
        data: input.data,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn edge_description(diagram_id: &str, input: EdgeInput) -> EdgeDescription {
    EdgeDescription {
        diagram: Ref::new(diagram_id.to_string()),
        source: input.source,
        target: input.target,
        source_handle: input.source_handle,
        target_handle: input.target_handle,
        kind: input.kind,
        relation_type: input.relation_type,
        label: input.label,
        style: input.style,
        data: input.data,
        animated: input.animated,
        hidden: input.hidden,
        marker_start: input.marker_start,
        marker_end: input.marker_end,
        path_options: input.path_options,
        interaction_width: input.interaction_width,
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

async fn propose_model(
    State(state): State<AppState>,
    Path((workspace_id, diagram_id)): Path<(String, String)>,
    Json(input): Json<ProposeModelInput>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>>, ApiError>
{
    if input.requirement.trim().is_empty() {
        return Err(ServerError::Validation("requirement is required".to_string()).into());
    }

    let (_, diagram) = load_diagram(&state, &workspace_id, &diagram_id).await?;
    let mut events =
        diagram.propose_model_stream(input.requirement, state.domain_architect.as_ref());

    let stream = async_stream::stream! {
        let mut had_error = false;

        while let Some(event) = events.next().await {
            match event {
                Ok(ModelingEvent::TextChunk { chunk }) => {
                    yield Ok(Event::default().data(chunk));
                }
                Ok(ModelingEvent::StructuredChunk { kind, format, chunk }) => {
                    let payload = StructuredChunkPayload { kind, format, chunk };
                    match serde_json::to_string(&payload) {
                        Ok(data) => yield Ok(Event::default().event("structured").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize structured chunk: {error}"))),
                    }
                }
                Ok(ModelingEvent::ReasoningStarted) => {
                    yield Ok(Event::default().event("thinking-start").data(""));
                }
                Ok(ModelingEvent::ReasoningChunk { chunk }) => {
                    yield Ok(Event::default().event("thinking").data(chunk));
                }
                Ok(ModelingEvent::ReasoningEnded) => {
                    yield Ok(Event::default().event("thinking-end").data(""));
                }
                Ok(ModelingEvent::ToolCallStarted { tool_call_id, tool_name }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name })) {
                        Ok(data) => yield Ok(Event::default().event("tool-call-start").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool call start: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolCallDelta { tool_call_id, tool_name, chunk }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "chunk": chunk })) {
                        Ok(data) => yield Ok(Event::default().event("tool-call-delta").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool call delta: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolCallReady { tool_call_id, tool_name, input }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "input": input })) {
                        Ok(data) => yield Ok(Event::default().event("tool-call").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool call: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolExecutionStarted { tool_call_id, tool_name, args }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "args": args })) {
                        Ok(data) => yield Ok(Event::default().event("tool-execution-start").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool execution start: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolExecutionUpdated { tool_call_id, tool_name, args, partial_result }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "args": args, "partialResult": partial_result })) {
                        Ok(data) => yield Ok(Event::default().event("tool-execution-update").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool execution update: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolExecutionEnded { tool_call_id, tool_name, result, is_error }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "result": result, "isError": is_error })) {
                        Ok(data) => yield Ok(Event::default().event("tool-execution-end").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool execution end: {error}"))),
                    }
                }
                Err(error) => {
                    had_error = true;
                    yield Ok(Event::default().event("error").data(error.to_string()));
                    break;
                }
            }
        }

        if !had_error {
            yield Ok(Event::default().event("complete").data(""));
        }
    };

    Ok(Sse::new(stream))
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
            "/api/workspaces/{workspaceId}/diagrams/{diagramId}/propose-model",
            get(get_diagram).post(propose_model),
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
    let model: DiagramModel = diagram_model(diagram);
    serde_json::to_value(model).expect("diagram model should serialize")
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
    let model: NodeModel = node_model(workspace_id, node);
    serde_json::to_value(model).expect("node model should serialize")
}

fn edge_resource(workspace_id: &str, edge: &DiagramEdge) -> Value {
    let model: EdgeModel = edge_model(workspace_id, edge);
    serde_json::to_value(model).expect("edge model should serialize")
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
